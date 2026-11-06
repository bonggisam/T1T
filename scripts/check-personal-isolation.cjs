#!/usr/bin/env node
/**
 * 개인 일정 격리 검사.
 *
 * 회의 찾기, 컴시간 연결표, 감독·당직 표는 공유 자료를 다룬다. 이 모듈들이 개인 일정을 가져오면
 * 계산 결과나 저장값을 통해 다른 사람에게 드러날 수 있으므로, 보안 규칙으로는 막을 수 없는 이 경로를 코드에서 막는다.
 *
 * 아래 파일과 그 파일들이 가져오는 파일을 따라가며 금지된 모듈이나 말이 있으면 실패한다.
 * 저장소(store)처럼 앱 전체를 잇는 파일은 따라가지 않고 그 파일 자체만 본다.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'src', 'renderer');
const ENTRIES = [
  'utils/meetingFinder.ts',
  'utils/neisTimetable.ts',
  'utils/teachingAssignments.ts',
  'utils/teachingDocs.ts',
  'components/board/BoardView.tsx',
  'components/board/BoardUploadModal.tsx',
  'components/board/BoardImageViewer.tsx',
  'store/boardStore.ts',
  'utils/boardImage.ts',
  'store/comciganLinksStore.ts',
  'hooks/useComciganOutage.ts',
  'store/comciganOutageStore.ts',
  'utils/comciganOutage.ts',
  'components/common/ComciganCall.tsx',
  'components/meeting/MeetingFinderView.tsx',
  'components/admin/TeachingTable.tsx',
];
const FORBIDDEN = [
  /personalEventStore/,
  /useVisiblePersonalEvents/,
  /personal_events/,
  /allPersonalEvents/,
  /externalEvents/,
  /PersonalEvent\b/,
  /calendarSync/,
];
/** 앱 전체를 잇는 저장소는 그 안에서 개인 일정을 다루지 않아도 따라가면 끝이 없다 */
const DO_NOT_FOLLOW = /\/store\/|\/components\/|\/hooks\//;

function resolveImport(from, spec) {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/** 실제 코드만 본다. 주석에서 금지된 말을 설명하는 것은 괜찮다. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

const seen = new Set();
const problems = [];

function visit(file, chain) {
  if (seen.has(file)) return;
  seen.add(file);
  const code = stripComments(fs.readFileSync(file, 'utf8'));
  for (const pattern of FORBIDDEN) {
    if (pattern.test(code)) {
      problems.push(`${path.relative(SRC, file)}: ${pattern.source}${chain.length ? ` (${chain.join(' → ')})` : ''}`);
    }
  }
  const imports = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  for (const spec of imports) {
    const target = resolveImport(file, spec);
    if (target && !DO_NOT_FOLLOW.test(target.split(path.sep).join('/'))) {
      visit(target, [...chain, path.relative(SRC, file)]);
    }
  }
}

for (const entry of ENTRIES) {
  const file = path.join(SRC, entry);
  if (!fs.existsSync(file)) {
    problems.push(`${entry}: 파일이 없습니다. 목록을 고쳐 주세요`);
    continue;
  }
  visit(file, []);
}

if (problems.length > 0) {
  console.error('개인 일정 격리 검사 실패:');
  problems.forEach((p) => console.error(`  ${p}`));
  process.exit(1);
}
console.log(`개인 일정 격리 검사 통과: ${seen.size}개 파일`);
