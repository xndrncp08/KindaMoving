import Link from 'next/link';
import { Activity, CalendarDays, Footprints } from 'lucide-react';
import { Button, Provenance } from '@km/ui';
import { Brand } from '@/components/brand';
import { RunPreview } from '@/components/run-preview';

// Sample week for the Analyze spotlight (km per day). Illustrative only.
const week = [
  ['M', 6.2],
  ['T', 8.4],
  ['W', 0],
  ['T', 5.1],
  ['F', 0],
  ['S', 13.1],
  ['S', 0],
] as const;
const peak = Math.max(...week.map(([, km]) => km));

export default function Home() {
  return (
    <div className="landing">
      <div className="night">
        <div className="container">
          <header className="site-nav">
            <Brand />
            <nav aria-label="Main navigation">
              <Link href="/login" className="nav-text">
                Log in
              </Link>
              <Button asChild className="nav-cta">
                <Link href="/login?mode=signup">Create an account</Link>
              </Button>
            </nav>
          </header>
        </div>
      </div>
      <main id="main">
        <section className="hero night">
          <div className="container">
            <div className="hero-grid">
              <div className="hero-copy">
                <h1>
                  Run smarter.
                  <br />
                  Suffer better.
                </h1>
                <p className="hero-lead">
                  Your miles have a story. KindaMoving keeps it straight: honest
                  numbers, a week you can plan, and routes worth running.
                </p>
                <div className="hero-actions">
                  <Button asChild>
                    <Link href="/login?mode=signup">Create an account</Link>
                  </Button>
                  <Link href="#features" className="hero-more">
                    See what’s inside
                  </Link>
                </div>
                <ul className="hero-facts" aria-label="At a glance">
                  <li>Works with COROS</li>
                  <li>GPX &amp; FIT import</li>
                  <li>Private by default</li>
                </ul>
              </div>
              <RunPreview />
            </div>
          </div>
        </section>

        <section className="container band" id="features">
          <h2 className="band-title">
            Less admin.
            <br />
            More endorphins.
          </h2>
          <ul className="pillars">
            {[
              [
                Activity,
                'Every mile counts.',
                'Import GPX or FIT files, sync from COROS or log by hand. Splits, heart rate and elevation, clearly laid out.',
              ],
              [
                CalendarDays,
                'Make room for running.',
                'Build a race plan or a single workout. Completed runs are matched to the plan, so the week stays honest.',
              ],
              [
                Footprints,
                'Know when they’ve had it.',
                'Assign shoes to runs and keep a true mileage history. Nostalgia is not cushioning.',
              ],
            ].map(([Icon, title, text]) => (
              <li key={String(title)}>
                <Icon aria-hidden="true" />
                <h3>{String(title)}</h3>
                <p>{String(text)}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="container spotlight">
          <div className="spotlight-copy">
            <p className="spotlight-kicker">Analyze</p>
            <h2>A clearer view of your kind of moving.</h2>
            <p>
              Every number says whether it was measured by your watch, estimated
              by a model or inferred from context. Missing data stays missing;
              it never quietly becomes a zero.
            </p>
          </div>
          <figure className="spot-panel">
            <ol
              className="spot-week"
              aria-label="Sample week, kilometres per day"
            >
              {week.map(([day, km], i) => (
                <li key={i}>
                  <span className="track">
                    <span
                      className={km ? 'bar' : 'bar rest'}
                      style={{
                        height: km ? `${(km / peak) * 100}%` : undefined,
                      }}
                    />
                  </span>
                  <span className="spot-day" aria-hidden="true">
                    {day}
                  </span>
                  <span className="sr-only">{km ? `${km} km` : 'Rest'}</span>
                </li>
              ))}
            </ol>
            <dl className="spot-metrics">
              <div>
                <dt>This week</dt>
                <dd>
                  32.8<small>km</small>
                </dd>
                <dd>
                  <Provenance kind="measured" />
                </dd>
              </div>
              <div>
                <dt>Average pace</dt>
                <dd>
                  5:42<small>/km</small>
                </dd>
                <dd>
                  <Provenance kind="measured" />
                </dd>
              </div>
              <div>
                <dt>10K estimate</dt>
                <dd>52:40</dd>
                <dd>
                  <Provenance kind="estimated" />
                </dd>
              </div>
            </dl>
            <figcaption>Sample data</figcaption>
          </figure>
        </section>

        <section className="container spotlight flip">
          <div className="spotlight-copy">
            <p className="spotlight-kicker">Routes</p>
            <h2>Good routes. Fewer surprises.</h2>
            <p>
              Routes are generated only on mapped, runnable ways. Crossings,
              climbing and recent runner reports are counted and explained,
              never assumed away.
            </p>
            <span className="badge quiet">Calgary pilot</span>
          </div>
          <figure className="spot-map">
            <svg viewBox="0 0 400 300" aria-hidden="true">
              <rect className="map-land" width="400" height="300" />
              <path className="map-park" d="M250 30h120v110H250z" />
              <path
                className="map-water"
                d="M-10 250C80 220 160 270 240 240S360 200 410 215V310H-10Z"
              />
              {[60, 130, 200].map((y) => (
                <path key={y} className="map-street" d={`M0 ${y}H400`} />
              ))}
              {[70, 170, 300].map((x) => (
                <path key={x} className="map-street" d={`M${x} 0V300`} />
              ))}
              <path
                className="map-route-casing"
                d="M70 200V130H170V60H300V130H230V200Z"
              />
              <path
                className="map-route"
                d="M70 200V130H170V60H300V130H230V200Z"
              />
              <circle className="map-crossing major" cx="170" cy="130" r="7" />
              <circle className="map-crossing minor" cx="300" cy="60" r="7" />
              <circle className="map-start" cx="70" cy="200" r="8" />
            </svg>
            <figcaption>
              <span className="legend route">Selected route</span>
              <span className="legend major">Major crossing</span>
              <span className="legend minor">Minor crossing</span>
            </figcaption>
          </figure>
        </section>

        <section className="container spotlight">
          <div className="spotlight-copy">
            <p className="spotlight-kicker">Your watch</p>
            <h2>COROS is on the starting line.</h2>
            <p>
              Connect through COROS’s official sign-in. Runs import read-only,
              and a route or workout goes to your watch only after you confirm
              it. File import works for every other device.
            </p>
            <span className="badge quiet">Official COROS sign-in</span>
          </div>
          <figure className="spot-watch" aria-label="Illustrative watch face">
            <div className="watch">
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <circle className="watch-track" cx="50" cy="50" r="44" />
                <circle
                  className="watch-progress"
                  cx="50"
                  cy="50"
                  r="44"
                  pathLength="100"
                  strokeDasharray="68 100"
                />
              </svg>
              <div className="watch-face">
                <span className="watch-label">Tempo</span>
                <span className="watch-value">4.1</span>
                <span className="watch-unit">of 6.0 km</span>
              </div>
            </div>
            <figcaption>Sent to your watch after you confirm</figcaption>
          </figure>
        </section>

        <section className="closing night">
          <div className="container">
            <h2>You don’t have to be fast to take yourself seriously.</h2>
            <p>
              Useful tools, honest numbers and a little perspective for the long
              run. Works in your phone’s browser; nothing to install.
            </p>
            <Button asChild>
              <Link href="/login?mode=signup">Create an account</Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="container site-footer">
        <Brand />
        <nav className="footer-links" aria-label="Footer">
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/login">Log in</Link>
        </nav>
        <p className="muted">
          © {new Date().getFullYear()} KindaMoving. Forward is a pace.
        </p>
      </footer>
    </div>
  );
}
