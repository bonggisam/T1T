/**
 * 급식 메뉴 글자를 그림(이모지)과 종류로 나눈다.
 * 학교 홈페이지 메뉴는 "★콰삭빠삭순살치킨★", "푸르티주스(선택)", "(딸기vs초코)", "직화마늘불고기+파채무침"처럼 온다.
 * 이모지는 Windows 10에서도 보이는 것(유니코드 11 이하, 국기 없음)만 쓴다.
 */

export type MealKind = 'rice' | 'soup' | 'main' | 'side' | 'kimchi' | 'dessert';

export interface MealItem {
  /** 화면에 보일 이름. 별표와 괄호 설명, 곁들임을 뺀 것 */
  name: string;
  /** 곁들임: "직화마늘불고기+파채무침"의 "파채무침" */
  extra?: string;
  emoji: string;
  kind: MealKind;
  /** ★…★로 표시한 특식 */
  special: boolean;
  /** (선택) */
  optional: boolean;
  /** (추가밥), (압맥) 같은 괄호 설명 */
  note?: string;
  /** 바로 다음 줄 "(딸기vs초코)"에서 읽은 고를 수 있는 맛 */
  options?: string[];
}

type Rule = [RegExp, string, MealKind];

// 앞에서부터 처음 맞는 규칙을 쓴다. 순서가 중요하다 (예: 닭볶음탕은 국보다 닭이 먼저, 배추김치는 과일 배보다 먼저)
const RULES: Rule[] = [
  [/(볶음밥|오므라이스)/, '🍳', 'rice'],
  [/(김밥|주먹밥|유부초밥|초밥)/, '🍙', 'rice'],
  [/(카레|커리|덮밥|하이라이스|라이스)/, '🍛', 'rice'],
  [/국밥/, '🍲', 'soup'],
  [/밥(?!버거)/, '🍚', 'rice'],
  [/(스프|수프|포타주)/, '🥣', 'soup'],
  [/(볶음탕|닭갈비|찜닭|치킨|닭강정|닭튀김|닭구이|닭다리|오리)/, '🍗', 'main'],
  [/(찌개|전골|곰탕|설렁탕|육개장|국$|탕$|국수제비)/, '🍲', 'soup'],
  [/(배추김치|포기김치|총각김치|열무김치|백김치|파김치|갓김치|김치$|겉절이|동치미|나박)/, '🥬', 'kimchi'],
  [/(깍두기|섞박지|석박지)/, '🌶️', 'kimchi'],
  [/(단호박)/, '🎃', 'side'],
  [/샐러드/, '🥗', 'side'],
  [/(계란말이|달걀말이|스크램블|에그)/, '🍳', 'side'],
  [/(계란|달걀|메추리알)/, '🥚', 'side'],
  [/(지짐|부침|빈대떡|오코노미야끼|동그랑땡|전$)/, '🥞', 'main'],
  [/(생선|고등어|삼치|갈치|꽁치|연어|동태|명태|코다리|가자미|조기|임연수|장어|참치)/, '🐟', 'main'],
  [/새우(?!젓)/, '🍤', 'main'],
  [/(오징어|한치)/, '🦑', 'main'],
  [/(낙지|쭈꾸미|주꾸미|문어)/, '🐙', 'main'],
  [/(순대|소시지|소세지|비엔나|핫도그)/, '🌭', 'main'],
  [/(불고기|갈비|스테이크|함박|돈까스|돈가스|까스|커틀릿|제육|수육|보쌈|족발|돈육|우육|쇠고기|소고기|돼지|목살|삼겹|미트볼|탕수육|고기|햄$|베이컨)/, '🥩', 'main'],
  [/(조개|홍합|바지락|꼬막)/, '🐚', 'side'],
  [/(어묵|오뎅)/, '🍢', 'side'],
  [/(맛살|게살|크래미)/, '🦀', 'side'],
  [/(만두|딤섬)/, '🥟', 'side'],
  [/떡볶이/, '🍢', 'main'],
  [/(스파게티|파스타|알리오|까르보|봉골레|라자냐)/, '🍝', 'side'],
  [/(짜장|자장|짬뽕|우동|국수|라면|냉면|쫄면|소바|라멘|쌀국수|잡채|당면|비빔면)/, '🍜', 'side'],
  [/피자/, '🍕', 'main'],
  [/버거/, '🍔', 'main'],
  [/(사과)/, '🍎', 'dessert'],
  [/(^배$|신고배)/, '🍐', 'dessert'],
  [/(귤|오렌지|한라봉|천혜향|레드향|자몽)/, '🍊', 'dessert'],
  [/바나나/, '🍌', 'dessert'],
  [/(포도|머스캣|블루베리)/, '🍇', 'dessert'],
  [/수박/, '🍉', 'dessert'],
  [/딸기/, '🍓', 'dessert'],
  [/키위/, '🥝', 'dessert'],
  [/파인애플/, '🍍', 'dessert'],
  [/(복숭아|황도|백도)/, '🍑', 'dessert'],
  [/체리/, '🍒', 'dessert'],
  [/(메론|멜론)/, '🍈', 'dessert'],
  [/망고/, '🥭', 'dessert'],
  [/레몬/, '🍋', 'dessert'],
  [/(감$|홍시|단감|곶감)/, '🍊', 'dessert'],
  [/(우유|요구르트|요거트|요플레|야쿠르트|두유|밀크|라떼)/, '🥛', 'dessert'],
  [/(주스|쥬스|에이드|스무디|음료|사이다|콜라)/, '🧃', 'dessert'],
  [/(식혜|수정과|매실|녹차|보리차|차$)/, '🍵', 'dessert'],
  [/(케이크|케익|카스텔라)/, '🍰', 'dessert'],
  [/(마들렌|피낭시에|빼낭시에|머핀|타르트)/, '🧁', 'dessert'],
  [/(쿠키|과자|비스킷|크래커|비쵸비)/, '🍪', 'dessert'],
  [/(도넛|도너츠|츄러스)/, '🍩', 'dessert'],
  [/(초코|초콜릿|브라우니)/, '🍫', 'dessert'],
  [/(아이스크림|빙수|샤베트|셔벗)/, '🍨', 'dessert'],
  [/(푸딩|판나코타)/, '🍮', 'dessert'],
  [/(젤리|구미|사탕|마카롱)/, '🍬', 'dessert'],
  [/(떡|경단|인절미|송편|약과)/, '🍡', 'dessert'],
  [/(샌드위치|토스트|빵|베이글|크루아상|크로와상|바게트|와플|팬케이크)/, '🍞', 'side'],
  [/(후르츠|후루츠|프룻|푸르티|과일)/, '🍹', 'dessert'],
  [/치즈/, '🧀', 'side'],
  [/(애호박|오이|호박)/, '🥒', 'side'],
  [/감자/, '🥔', 'side'],
  [/고구마/, '🍠', 'side'],
  [/(옥수수|콘)/, '🌽', 'side'],
  [/(버섯|새송이|양송이|표고|팽이)/, '🍄', 'side'],
  [/(콩나물|숙주)/, '🌱', 'side'],
  [/묵/, '🌰', 'side'],
  [/브로콜리/, '🥦', 'side'],
  [/당근/, '🥕', 'side'],
  [/토마토/, '🍅', 'side'],
];

export function mealEmoji(name: string): { emoji: string; kind: MealKind } {
  const plain = name.replace(/\s+/g, '');
  for (const [re, emoji, kind] of RULES) {
    if (re.test(plain)) return { emoji, kind };
  }
  return { emoji: '🌿', kind: 'side' };
}

const OPTIONS_LINE = /^\(([^()]*vs[^()]*)\)$/i;

/** 학교 홈페이지 메뉴 줄들을 그림과 종류가 붙은 항목으로 바꾼다 */
export function parseMenu(lines: string[]): MealItem[] {
  const items: MealItem[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const choice = line.match(OPTIONS_LINE);
    if (choice) {
      const options = choice[1].split(/\s*vs\s*/i).map((s) => s.trim()).filter(Boolean);
      const prev = items[items.length - 1];
      if (prev && !prev.options) { prev.options = options; continue; }
    }
    let text = line;
    const special = /★/.test(text);
    text = text.replace(/★/g, '').trim();
    let optional = false;
    const notes: string[] = [];
    text = text.replace(/\(([^()]*)\)/g, (_m, inner: string) => {
      const v = inner.trim();
      if (v === '선택') optional = true;
      else if (v) notes.push(v);
      return '';
    }).trim();
    const [head, ...rest] = text.split(/\s*[+&/]\s*/).filter(Boolean);
    const name = head || text || line;
    const { emoji, kind } = mealEmoji(name);
    items.push({
      name,
      extra: rest.length ? rest.join(', ') : undefined,
      emoji,
      kind,
      special,
      optional,
      note: notes.length ? notes.join(', ') : undefined,
    });
  }
  return items;
}

const HEARTY = /(국밥|볶음밥|덮밥|카레|비빔밥|짜장|짬뽕|라면|우동|국수|파스타|스파게티|피자|버거)/;
const PROTEIN = /(🍗|🥩|🐟|🍤|🦑|🐙|🌭)/;

/** 그날을 대표하는 메뉴: 특식 → 고기·생선 → 한 그릇 음식 → 주요리 → 국 */
export function mainDish(items: MealItem[]): MealItem | undefined {
  return items.find((i) => i.special)
    ?? items.find((i) => i.kind === 'main' && PROTEIN.test(i.emoji))
    ?? items.find((i) => HEARTY.test(i.name))
    ?? items.find((i) => i.kind === 'main')
    ?? items.find((i) => i.kind === 'soup')
    ?? items[0];
}

/** "1,292Kcal", "851.74Kcal" → 1292, 852 */
export function parseKcal(text: string | undefined): number | null {
  if (!text) return null;
  const m = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Math.round(parseFloat(m[1]));
  return Number.isFinite(n) && n > 0 ? n : null;
}
