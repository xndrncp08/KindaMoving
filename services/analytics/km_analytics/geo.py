"""Geodesy on the WGS84 ellipsoid.

Two distance functions are provided:

* ``segment_m`` — tangent-plane approximation using the meridional (M) and
  prime-vertical (N) radii of curvature at the segment's mean latitude.
  Relative error grows with (d/R)^2, i.e. below 1e-9 for the < 1 km spacing of
  recorded GPS samples, and it is ~20x faster than iterative Vincenty in pure
  Python. Used for track accumulation.
* ``vincenty_m`` — Vincenty's inverse formula (sub-millimetre on the ellipsoid)
  for arbitrary separations; falls back to the haversine great-circle distance
  for the nearly-antipodal inputs where the iteration does not converge.
"""

from __future__ import annotations

import math

A = 6378137.0  # WGS84 semi-major axis (m)
F = 1 / 298.257223563
B = A * (1 - F)
E2 = F * (2 - F)  # first eccentricity squared
MEAN_RADIUS = 6371008.8  # IUGG mean Earth radius (m)


def radii(lat_deg: float) -> tuple[float, float]:
    """Meridional (M) and prime-vertical (N) radii of curvature in metres."""
    s = math.sin(math.radians(lat_deg))
    w = math.sqrt(1 - E2 * s * s)
    return A * (1 - E2) / w**3, A / w


def segment_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    m, n = radii((lat1 + lat2) / 2)
    dy = math.radians(lat2 - lat1) * m
    dx = math.radians(lon2 - lon1) * n * math.cos(math.radians((lat1 + lat2) / 2))
    return math.hypot(dx, dy)


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * MEAN_RADIUS * math.asin(min(1.0, math.sqrt(h)))


def vincenty_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    if lat1 == lat2 and lon1 == lon2:
        return 0.0
    L = math.radians(lon2 - lon1)
    U1 = math.atan((1 - F) * math.tan(math.radians(lat1)))
    U2 = math.atan((1 - F) * math.tan(math.radians(lat2)))
    sinU1, cosU1, sinU2, cosU2 = math.sin(U1), math.cos(U1), math.sin(U2), math.cos(U2)
    lam = L
    for _ in range(200):
        sin_lam, cos_lam = math.sin(lam), math.cos(lam)
        sin_sigma = math.hypot(cosU2 * sin_lam, cosU1 * sinU2 - sinU1 * cosU2 * cos_lam)
        if sin_sigma == 0:
            return 0.0
        cos_sigma = sinU1 * sinU2 + cosU1 * cosU2 * cos_lam
        sigma = math.atan2(sin_sigma, cos_sigma)
        sin_alpha = cosU1 * cosU2 * sin_lam / sin_sigma
        cos2_alpha = 1 - sin_alpha**2
        cos2_sm = cos_sigma - 2 * sinU1 * sinU2 / cos2_alpha if cos2_alpha else 0.0
        C = F / 16 * cos2_alpha * (4 + F * (4 - 3 * cos2_alpha))
        prev = lam
        lam = L + (1 - C) * F * sin_alpha * (sigma + C * sin_sigma * (cos2_sm + C * cos_sigma * (-1 + 2 * cos2_sm**2)))
        if abs(lam - prev) < 1e-12:
            break
    else:
        return haversine_m(lat1, lon1, lat2, lon2)
    u2 = cos2_alpha * (A * A - B * B) / (B * B)
    big_a = 1 + u2 / 16384 * (4096 + u2 * (-768 + u2 * (320 - 175 * u2)))
    big_b = u2 / 1024 * (256 + u2 * (-128 + u2 * (74 - 47 * u2)))
    d_sigma = big_b * sin_sigma * (
        cos2_sm + big_b / 4 * (cos_sigma * (-1 + 2 * cos2_sm**2) - big_b / 6 * cos2_sm * (-3 + 4 * sin_sigma**2) * (-3 + 4 * cos2_sm**2))
    )
    return B * big_a * (sigma - d_sigma)


class LocalProjection:
    """Equirectangular projection about an origin, scaled by local radii of curvature.

    Accurate to well under a metre within ~20 km of the origin, which covers a
    running route. Used for geometric work (projection onto polylines, grids).
    """

    def __init__(self, lat0: float, lon0: float):
        self.lat0, self.lon0 = lat0, lon0
        m, n = radii(lat0)
        self.ky = math.radians(1) * m
        self.kx = math.radians(1) * n * math.cos(math.radians(lat0))

    def to_xy(self, lat: float, lon: float) -> tuple[float, float]:
        return (lon - self.lon0) * self.kx, (lat - self.lat0) * self.ky

    def to_latlon(self, x: float, y: float) -> tuple[float, float]:
        return self.lat0 + y / self.ky, self.lon0 + x / self.kx


def project_point_segment(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> tuple[float, float]:
    """Return (fraction along AB in [0,1], distance from P to the closest point)."""
    dx, dy = bx - ax, by - ay
    denom = dx * dx + dy * dy
    u = 0.0 if denom == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / denom))
    return u, math.hypot(px - (ax + u * dx), py - (ay + u * dy))


def simplify(points: list[tuple[float, float]], tolerance: float) -> list[int]:
    """Douglas–Peucker on projected (x, y) points; returns the kept indices.

    Iterative (explicit stack) so very long tracks cannot hit the recursion limit.
    """
    n = len(points)
    if n < 3:
        return list(range(n))
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        i, j = stack.pop()
        ax, ay = points[i]
        bx, by = points[j]
        worst, idx = -1.0, -1
        for k in range(i + 1, j):
            _, d = project_point_segment(points[k][0], points[k][1], ax, ay, bx, by)
            if d > worst:
                worst, idx = d, k
        if worst > tolerance:
            keep[idx] = True
            stack.extend(((i, idx), (idx, j)))
    return [i for i, k in enumerate(keep) if k]


def bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dl = math.radians(lon2 - lon1)
    y = math.sin(dl) * math.cos(p2)
    x = math.cos(p1) * math.sin(p2) - math.sin(p1) * math.cos(p2) * math.cos(dl)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def destination(lat: float, lon: float, bearing: float, distance_m: float) -> tuple[float, float]:
    """Spherical forward problem; adequate for choosing candidate waypoints."""
    d = distance_m / MEAN_RADIUS
    b = math.radians(bearing)
    p1, l1 = math.radians(lat), math.radians(lon)
    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(b))
    l2 = l1 + math.atan2(math.sin(b) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2))
    return math.degrees(p2), (math.degrees(l2) + 540) % 360 - 180
