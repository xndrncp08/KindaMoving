"""Normalized activity structures shared by the parsers and processing pipeline.

Units: metres, seconds, degrees (WGS84), beats/min, steps/min (both feet).
Timestamps are float Unix seconds in UTC.
"""

from __future__ import annotations

from dataclasses import dataclass, field


class ActivityFileError(ValueError):
    """A file that cannot be imported. The message is safe to show to the user."""


@dataclass
class Sample:
    t: float
    lat: float | None = None
    lon: float | None = None
    ele: float | None = None
    hr: float | None = None
    cad: float | None = None
    device_dist: float | None = None


@dataclass
class Lap:
    start: float
    end: float
    distance_m: float | None = None


@dataclass
class ParsedActivity:
    format: str
    sport: str = "running"
    samples: list[Sample] = field(default_factory=list)
    laps: list[Lap] = field(default_factory=list)
    utc_offset_s: int | None = None
    device: dict = field(default_factory=dict)
    name: str | None = None
    warnings: list[str] = field(default_factory=list)
    elevation_source: str = "gps"
