import path from 'node:path';
import { scanVideoForHyperframesFrameIssues } from '../src/utils/hyperframes-frame-gate.ts';

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: npm run scan:hyperframes-video -- /absolute/path/to/video.mp4');
    process.exit(1);
  }

  const videoPath = path.resolve(input);
  const report = await scanVideoForHyperframesFrameIssues(videoPath);
  console.log(JSON.stringify(report, null, 2));
  if (report.failed) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
