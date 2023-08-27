import * as xiaohongshu from './xiaohongshu.js';

const main = async ({ argv }) => {
  const textWithUrl = argv?.[0] || '';
  if (xiaohongshu.check(textWithUrl)) {
    await xiaohongshu.save(argv?.[0] || '');
  }
};

main({
  argv: process.argv.splice(2),
}).then((exitCode) => {
  process.exit(exitCode);
});
