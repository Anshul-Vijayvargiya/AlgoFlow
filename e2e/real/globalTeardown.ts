import { cleanUpRun } from '../../server/e2e/processes';

/** stops the API and the mongod this run started and removes the temporary database folder */
export default function globalTeardown() {
  cleanUpRun();
}
