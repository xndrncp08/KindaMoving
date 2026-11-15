import { RouteArt } from './route-art';
// Sample kilometre splits (s/km). Illustrative only; captioned as sample data.
const splits = [341, 332, 328, 325, 319, 322, 314, 302];
const fastest = Math.min(...splits);
/** A run summary drawn in the app's own visual language, for the landing hero and auth panel. */
export function RunPreview() {
  return (
    <figure className="run-preview">
      <div className="run-preview-map">
        <RouteArt />
        <span className="run-preview-tag">Tuesday · 06:12</span>
      </div>
      <div className="run-preview-body">
        <p className="run-preview-title">Morning run</p>
        <dl className="run-preview-stats">
          <div>
            <dt>Distance</dt>
            <dd>
              8.42<small>km</small>
            </dd>
          </div>
          <div>
            <dt>Pace</dt>
            <dd>
              5:24<small>/km</small>
            </dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>45:28</dd>
          </div>
        </dl>
        <ol className="run-preview-splits" aria-label="Kilometre splits">
          {splits.map((s, i) => (
            <li
              key={i}
              className={s === fastest ? 'fastest' : undefined}
              style={{ height: `${40 + ((360 - s) / 60) * 60}%` }}
            >
              <span className="sr-only">
                Kilometre {i + 1}: {Math.floor(s / 60)}:
                {String(s % 60).padStart(2, '0')}
              </span>
            </li>
          ))}
        </ol>
      </div>
      <figcaption>Illustrative preview · sample data</figcaption>
    </figure>
  );
}
