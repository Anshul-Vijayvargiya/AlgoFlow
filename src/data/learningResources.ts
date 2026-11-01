/**
 * Downloadable learning resources, listed on the Resources page (/resources, src/pages/resources/DownloadableNotes.tsx).
 * Each file is a public static asset in public/downloads/ (served as-is by Vite in development and copied into the
 * build), so it needs no login, no database record and no API route; its link is relative to the app's base URL, so it
 * works wherever the app is deployed. (Not public/resources/: a folder of files at the same path as the /resources
 * page would make some static hosts answer a reload of the page with the folder instead of the app.)
 */
export interface LearningResource {
  id: string;
  title: string;
  description: string;
  format: 'PDF';
  pages: number;
  /** the file's size, shown with the download (checked against the file by a test) */
  sizeBytes: number;
  /** the file's path under public/ */
  path: string;
  /** the name the browser saves it under */
  downloadName: string;
}

export const LEARNING_RESOURCES: readonly LearningResource[] = [
  {
    id: 'sql-notes',
    title: 'SQL Notes',
    description: 'MySQL basics, CRUD, datatypes, keys, constraints, filtering, aggregates, joins, UNION, subqueries, and views.',
    format: 'PDF',
    pages: 6,
    sizeBytes: 175_152,
    path: 'downloads/sql-notes.pdf',
    downloadName: 'AlgoFlow-SQL-Notes.pdf',
  },
];

/** the resource's URL in the running app (the base URL is "/" unless the app is deployed under a sub-path) */
export const resourceUrl = (r: Pick<LearningResource, 'path'>, base: string = import.meta.env.BASE_URL ?? '/') => `${base.endsWith('/') ? base : `${base}/`}${r.path}`;

/** "171 KB" */
export const fileSizeText = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);

/**
 * Whether the file is really there: a HEAD request that must answer 200 with a PDF content type (a development server
 * answers a missing file with the app's own HTML page, which is not the notes). One check per URL per page load.
 */
const checks = new Map<string, Promise<boolean>>();
export function checkResource(url: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  let check = checks.get(url);
  if (!check) {
    check = fetchImpl(url, { method: 'HEAD' })
      .then(res => res.ok && (res.headers.get('content-type') ?? '').toLowerCase().includes('application/pdf'))
      .catch(() => false);
    checks.set(url, check);
  }
  return check;
}
export const _resetResourceChecksForTesting = () => checks.clear();
