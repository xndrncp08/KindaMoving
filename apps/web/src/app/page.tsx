import Link from 'next/link';
import {
  ArrowUpRight,
  Activity,
  Map,
  CalendarDays,
  Footprints,
  Watch,
  Smartphone,
} from 'lucide-react';
import { Button, Card } from '@km/ui';
import { Brand } from '@/components/brand';
import { RouteArt } from '@/components/route-art';
export default function Home() {
  return (
    <div className="container">
      <header className="site-nav">
        <Brand />
        <nav className="row" aria-label="Main navigation">
          <Link className="desktop-link" href="#features">
            The good stuff
          </Link>
          <Link href="/login" className="nav-text">
            Log in
          </Link>
          <Button asChild className="nav-cta">
            <Link href="/login?mode=signup">Create an account</Link>
          </Button>
        </nav>
      </header>
      <main id="main">
        <section className="hero">
          <div>
            <p className="eyebrow">For runners. Even the reluctant ones.</p>
            <h1>
              Run smarter.
              <br />
              <em>Suffer</em> better.
            </h1>
            <p className="muted">
              Your miles have a story. Give them a home. A little more clarity,
              a little less spreadsheet, and a good reason to lace up tomorrow.
            </p>
            <div className="row">
              <Button asChild>
                <Link href="/login?mode=signup">Create an account</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="#inside">Take a look inside</Link>
              </Button>
            </div>
          </div>
          <div className="hero-visual">
            <RouteArt />
            <div className="row between">
              <span className="badge">The everyday athlete</span>
              <ArrowUpRight />
            </div>
            <div className="visual-data">
              <p className="eyebrow">An ordinary Tuesday. A very good run.</p>
              <div className="row between">
                <div>
                  <p className="metric">
                    8.42 <small>km</small>
                  </p>
                  <p className="muted">Distance</p>
                </div>
                <div>
                  <p className="metric">5:24</p>
                  <p className="muted">Pace / km</p>
                </div>
                <div>
                  <p className="metric">45:28</p>
                  <p className="muted">Moving time</p>
                </div>
              </div>
              <p className="eyebrow muted">
                Illustrative product preview · sample data
              </p>
            </div>
          </div>
        </section>
        <section className="section" id="features">
          <div className="section-head">
            <h2>
              Less admin.
              <br />
              More endorphins.
            </h2>
            <p className="muted">
              Import a run, plan the week, track your shoes. No algorithm
              telling you how to feel about a Tuesday.
            </p>
          </div>
          <div className="grid">
            {[
              [
                Activity,
                'Review',
                'Every mile counts.',
                'Import GPX or FIT files, or log by hand. Splits, heart rate, elevation and a clear view of the work you put in.',
              ],
              [
                CalendarDays,
                'Plan',
                'Make room for running.',
                'Build a race plan or a single workout. Completed runs are matched to the plan. Enjoy that tiny dopamine hit.',
              ],
              [
                Footprints,
                'Equip',
                'Know when they’ve had it.',
                'Assign shoes to your runs and keep an honest mileage history. Nostalgia is not cushioning.',
              ],
            ].map(([Icon, num, title, text]) => (
              <Card key={String(title)}>
                <p className="feature-number">{String(num)}</p>
                <Icon className="feature-icon" size={30} aria-hidden="true" />
                <h3>{String(title)}</h3>
                <p className="muted">{String(text)}</p>
              </Card>
            ))}
          </div>
        </section>
        <section className="section" id="inside">
          <div className="section-head">
            <h2>
              A clearer view
              <br />
              of your kind of moving.
            </h2>
            <p className="muted">
              Every number says whether it was measured, estimated or inferred.
              These figures are examples, not your activity data.
            </p>
          </div>
          <dl
            className="instrument"
            aria-label="Illustrative week · sample data"
          >
            {[
              ['Weekly distance', '32.8 km'],
              ['Activities', '4 runs'],
              ['Average pace', '5:42 /km'],
            ].map(([label, value]) => (
              <div className="instrument-cell" key={label}>
                <dt>{label}</dt>
                <dd className="metric num">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="section">
          <div className="grid two">
            <Card>
              <Map className="feature-icon" />
              <p className="eyebrow">Routes & conditions</p>
              <h2>
                Good routes.
                <br />
                Fewer surprises.
              </h2>
              <p className="muted">
                Routes are generated only on mapped, runnable ways. Crossings,
                climbing and recent runner reports are counted and explained,
                never assumed away. Calgary is the pilot area.
              </p>
              <span className="badge quiet">Calgary pilot</span>
            </Card>
            <Card>
              <Watch className="feature-icon" />
              <p className="eyebrow">Your watch</p>
              <h2>
                COROS is on
                <br />
                the starting line.
              </h2>
              <p className="muted">
                Connect through COROS’s official sign-in. KindaMoving imports
                your runs read-only, and sends a route or workout to your watch
                only after you confirm it. File import works for every device.
              </p>
              <span className="badge quiet">Official COROS sign-in</span>
            </Card>
          </div>
        </section>
        <section className="section">
          <div className="grid two">
            <div>
              <Smartphone className="feature-icon" />
              <h2>
                Made for the moment
                <br />
                you stop your watch.
              </h2>
              <p className="muted">
                A responsive web app that works on your phone, from quick
                activity entries to checking what’s on the calendar. No native
                app download required.
              </p>
            </div>
            <div
              className="mobile-preview"
              aria-label="Illustrative mobile preview"
            >
              <p className="phone-time">09:41 · KindaMoving</p>
              <p className="eyebrow">This week, your way</p>
              <h3>
                A little progress.
                <br />A lot of good.
              </h3>
              <hr className="divider" />
              <p className="metric">
                3 <small>runs</small>
              </p>
              <p className="muted">Example week</p>
              <div className="badge">You showed up.</div>
            </div>
          </div>
        </section>
        <section className="section">
          <p className="eyebrow">Our philosophy</p>
          <h2 className="big-statement">
            You don’t have to be fast to take yourself seriously.
          </h2>
          <p className="muted">
            Running is already hard enough. Your software should make it
            simpler. We’re building useful tools, honest numbers, and a little
            perspective for the long run.
          </p>
          <Button asChild>
            <Link href="/login?mode=signup">Create an account</Link>
          </Button>
        </section>
      </main>
      <footer>
        <div className="row between">
          <Brand />
          <div className="footer-links">
            <Link href="/privacy">Privacy</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/login">Your account</Link>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 24 }}>
          © {new Date().getFullYear()} KindaMoving. Forward is a pace.
        </p>
      </footer>
    </div>
  );
}
