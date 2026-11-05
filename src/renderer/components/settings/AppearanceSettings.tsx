import React, { useMemo, useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { EVENT_FONT_SIZES, useAppearanceStore, type ColorBasis, type EventFontPx } from '../../store/appearanceStore';
import { getPlateAlpha, getPlateMin, getZoom, PLATE_ALPHA_MAX, setPlateAlpha, setZoom, ZOOM_CHOICES } from '../../utils/displayPrefs';
import {
  ACCENTS, THEME_PRESETS, themeTokens, worstContrast,
  type AccentKey, type ThemeChoice, type ThemePresetKey,
} from '../../utils/themes';

const THEME_ORDER: ThemePresetKey[] = ['clear', 'grid', 'chalk', 'night', 'blossom', 'contrast'];
const BIG_KEY = 't1t-big-view';
const BIG_VIEW = { eventFontPx: 15 as EventFontPx, zoom: 125, plate: 95 };

const COLOR_BASES: Array<{ key: ColorBasis; label: string }> = [
  { key: 'school', label: '학교' },
  { key: 'category', label: '분류' },
  { key: 'author', label: '작성자' },
];

interface BigBackup { eventFontPx: EventFontPx; zoom: number; plate: number }

function readBigBackup(): BigBackup | null {
  try {
    const raw = localStorage.getItem(BIG_KEY);
    return raw ? (JSON.parse(raw) as BigBackup) : null;
  } catch {
    return null;
  }
}

function writeBigBackup(value: BigBackup | null): void {
  try {
    if (value) localStorage.setItem(BIG_KEY, JSON.stringify(value));
    else localStorage.removeItem(BIG_KEY);
  } catch (e) {
    console.warn('[Appearance] big view save failed:', e);
  }
}

function ThemeTile({ choice, selected, onSelect }: { choice: ThemeChoice; selected: boolean; onSelect: () => void }) {
  const preset = choice === 'system' ? null : THEME_PRESETS[choice];
  const name = preset ? preset.name : '시스템 설정 따르기';
  const paper = preset ? `rgb(${preset.surf.join(' ')})` : 'linear-gradient(135deg, rgb(247 248 251) 50%, rgb(21 23 30) 50%)';
  const accent = preset ? `rgb(${themeTokens(choice as ThemePresetKey, 'theme').accentRgb.join(' ')})` : '#7C87A0';
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      style={{ ...styles.tile, ...(selected ? styles.tileOn : {}) }}
    >
      <span
        aria-hidden="true"
        style={{
          ...styles.tilePaper,
          // undefined를 넘기면 앞서 준 배경까지 지워지므로 경우를 나눈다
          ...(preset
            ? { backgroundColor: paper, backgroundImage: preset.texture ?? 'none', backgroundSize: preset.textureSize ?? 'auto' }
            : { background: paper }),
          color: preset?.ink ?? '#7C87A0',
        }}
      >
        <i style={{ ...styles.tileDot, background: accent }} />
        <i style={{ ...styles.tileLine, background: 'currentColor' }} />
        <i style={{ ...styles.tileLineShort, background: accent }} />
      </span>
      <span style={styles.tileName}>{name}</span>
      {selected && <Check size={12} strokeWidth={3} style={styles.tileCheck} />}
    </button>
  );
}

/** 지금 설정으로 그린 일정 몇 가지. 바꾸는 즉시 함께 바뀐다. */
function Preview() {
  const family = (key: string) => ({
    '--c-base': `var(--fam-${key})`,
    '--c-ink': `var(--fam-${key}-ink)`,
    '--c-solid': `var(--fam-${key}-solid)`,
    '--c-on': `var(--fam-${key}-on)`,
  }) as React.CSSProperties;
  return (
    <div style={styles.preview} aria-label="미리보기" className="glass">
      <div style={styles.previewDays}>
        <span style={{ color: 'var(--weekend-text)' }}>일</span>
        <span>월</span>
        <span className="today-num"><svg viewBox="0 0 36 36" aria-hidden="true"><path d="M26.2 6.6C20 3 9.6 4.6 6.1 12.4c-3.4 7.8 1.6 17 10.5 18.4 8.7 1.3 16.5-4.5 16.7-13C33.5 10 26.8 5.2 18.6 5.5" /></svg>화</span>
        <span>수</span>
        <span style={{ color: 'var(--saturday-text)' }}>토</span>
      </div>
      <div style={styles.previewChips}>
        <span className="ev" style={family('all')}><span className="ltr">공</span><span className="tt">교직원 회의</span></span>
        <span className="ev" style={family('mid')}><span className="ltr">중</span><span className="tt">학부모 공개수업</span></span>
        <span className="ev" style={family('high')}><span className="ltr">고</span><span className="tt">현장체험학습</span></span>
        <span className="ev" style={family('me')}><Lock size="0.85em" strokeWidth={2.4} /><span className="tt">내 일정</span></span>
      </div>
      <p style={styles.previewText}>본문 글자 <span style={{ color: 'var(--text-secondary)' }}>보조 글자</span> <span style={{ color: 'var(--accent)', fontWeight: 700 }}>강조색</span></p>
    </div>
  );
}

/** 화면 설정. 누르는 즉시 적용되고 따로 저장하지 않아도 된다. */
export function AppearanceSettings() {
  const { theme, accent, eventFontPx, colorBy, colorAssist, hideWeekend, preset, update } = useAppearanceStore();
  const [plate, setPlateState] = useState(getPlateAlpha);
  const [zoom, setZoomState] = useState(getZoom);
  const [bigBackup, setBigBackup] = useState(readBigBackup);
  const locked = !!THEME_PRESETS[preset].lockAlpha;
  const min = getPlateMin();
  const shown = Math.max(plate, min);
  const contrast = useMemo(() => worstContrast(preset, shown), [preset, shown]);

  function changePlate(value: number) {
    setPlateState(value);
    setPlateAlpha(value);
  }

  function changeZoom(value: number) {
    setZoomState(value);
    setZoom(value);
  }

  function chooseTheme(next: ThemeChoice) {
    update({ theme: next });
    // 테마마다 기본 농도와 하한이 달라 화면 값도 다시 읽는다
    setPlateState(getPlateAlpha());
  }

  function toggleBig() {
    if (bigBackup) {
      update({ eventFontPx: bigBackup.eventFontPx });
      changeZoom(bigBackup.zoom);
      changePlate(bigBackup.plate);
      writeBigBackup(null);
      setBigBackup(null);
      return;
    }
    const backup = { eventFontPx, zoom, plate: shown };
    writeBigBackup(backup);
    setBigBackup(backup);
    update({ eventFontPx: BIG_VIEW.eventFontPx });
    changeZoom(BIG_VIEW.zoom);
    changePlate(BIG_VIEW.plate);
  }

  return (
    <div style={styles.wrap}>
      <div>
        <span style={styles.label}>테마</span>
        <div style={styles.tiles}>
          {THEME_ORDER.map((key) => (
            <ThemeTile key={key} choice={key} selected={theme === key} onSelect={() => chooseTheme(key)} />
          ))}
          <ThemeTile choice="system" selected={theme === 'system'} onSelect={() => chooseTheme('system')} />
        </div>
      </div>

      <Preview />

      <div style={styles.row}>
        <span style={styles.label}>강조색</span>
        <div style={styles.accents} role="group" aria-label="강조색">
          <button
            type="button"
            onClick={() => update({ accent: 'theme' })}
            aria-pressed={accent === 'theme'}
            aria-label="테마 기본"
            title="테마 기본"
            style={{ ...styles.accent, background: `rgb(${themeTokens(preset, 'theme').accentRgb.join(' ')})`, ...(accent === 'theme' ? styles.accentOn : {}) }}
          />
          {(Object.keys(ACCENTS) as Array<Exclude<AccentKey, 'theme'>>).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => update({ accent: key })}
              aria-pressed={accent === key}
              aria-label={ACCENTS[key].name}
              title={ACCENTS[key].name}
              style={{ ...styles.accent, background: `rgb(${themeTokens(preset, key).accentRgb.join(' ')})`, ...(accent === key ? styles.accentOn : {}) }}
            />
          ))}
        </div>
      </div>

      <div style={styles.row}>
        <span style={styles.label}>일정 글자</span>
        <div className="seg" role="group" aria-label="일정 글자 크기">
          {EVENT_FONT_SIZES.map((size) => (
            <button key={size} type="button" onClick={() => update({ eventFontPx: size })} aria-pressed={eventFontPx === size}>{size}px</button>
          ))}
        </div>
      </div>

      <div style={styles.row}>
        <span style={styles.label}>크게 보기</span>
        <button type="button" onClick={toggleBig} aria-pressed={!!bigBackup} style={{ ...styles.bigBtn, ...(bigBackup ? styles.bigBtnOn : {}) }}>
          {bigBackup ? '원래대로' : '한 번에 키우기'}
        </button>
      </div>
      {!bigBackup && <p style={styles.note}>일정 글자 15px, 화면 배율 125%, 배경 농도 95%로 맞춥니다.</p>}

      <div style={styles.row}>
        <span style={styles.label}>일정 색 기준</span>
        <div className="seg" role="group" aria-label="일정 색 기준">
          {COLOR_BASES.map(({ key, label }) => (
            <button key={key} type="button" onClick={() => update({ colorBy: key })} aria-pressed={colorBy === key}>{label}</button>
          ))}
        </div>
      </div>

      <label style={styles.row}>
        <span style={styles.label}>색 구분 돕기</span>
        <input type="checkbox" checked={colorAssist} onChange={(e) => update({ colorAssist: e.target.checked })} />
      </label>
      {colorAssist && colorBy !== 'school' && <p style={styles.note}>무늬는 일정 색 기준이 학교일 때 함께 나타납니다.</p>}

      <label style={styles.row}>
        <span style={styles.label}>주말 숨기기</span>
        <input type="checkbox" checked={hideWeekend} onChange={(e) => update({ hideWeekend: e.target.checked })} />
      </label>

      <div style={styles.row}>
        <span style={styles.label}>배경 농도: {shown}%</span>
        <input
          type="range"
          min={min}
          max={PLATE_ALPHA_MAX}
          step={1}
          value={shown}
          disabled={locked}
          onChange={(e) => changePlate(Number(e.target.value))}
          aria-label="배경 농도"
          style={styles.slider}
        />
      </div>
      <p style={styles.note}>
        {locked
          ? '고대비는 농도를 낮출 수 없습니다.'
          : `보조 글자 대비: 검은 바탕 ${contrast.dark.toFixed(1)}:1, 흰 바탕 ${contrast.bright.toFixed(1)}:1. 이 테마는 ${min}% 아래로 내려가지 않습니다.`}
      </p>

      <div style={styles.row}>
        <span style={styles.label}>화면 배율</span>
        <div className="seg" role="group" aria-label="화면 배율">
          {ZOOM_CHOICES.map((z) => (
            <button key={z} type="button" onClick={() => changeZoom(z)} aria-pressed={zoom === z}>{z}%</button>
          ))}
        </div>
      </div>
      <p style={styles.note}>배경 농도와 화면 배율은 이 PC에만 저장합니다. 나머지는 계정에 저장해 다른 PC에서도 같게 보입니다.</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  label: {
    fontSize: 'var(--fs-body)',
    color: 'var(--text-secondary)',
  },
  note: {
    margin: '-6px 0 0',
    fontSize: 'var(--fs-label)',
    lineHeight: 1.45,
    color: 'var(--text-muted)',
  },
  tiles: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
    gap: 6,
    marginTop: 6,
  },
  tile: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 5,
    border: '1px solid var(--border-color)',
    borderRadius: 9,
    background: 'transparent',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    textAlign: 'left',
  },
  tileOn: {
    borderColor: 'var(--accent)',
    boxShadow: 'inset 0 0 0 1px var(--accent)',
  },
  tilePaper: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
    height: 40,
    padding: 5,
    borderRadius: 6,
    boxShadow: 'inset 0 0 0 1px rgb(0 0 0 / .1)',
  },
  tileDot: {
    width: 9,
    height: 9,
    borderRadius: '50%',
  },
  tileLine: {
    width: '78%',
    height: 3,
    borderRadius: 2,
    opacity: 0.7,
  },
  tileLineShort: {
    width: '48%',
    height: 3,
    borderRadius: 2,
  },
  tileName: {
    fontSize: 'var(--fs-label)',
    fontWeight: 600,
    lineHeight: 1.2,
  },
  tileCheck: {
    position: 'absolute',
    top: 8,
    right: 8,
    color: 'var(--accent)',
  },
  preview: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 8,
    borderRadius: 10,
    boxShadow: 'none',
    backgroundImage: 'var(--plate-texture, none)',
    backgroundSize: 'var(--plate-texture-size, auto)',
  },
  previewDays: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 'var(--fs-control)',
    fontWeight: 600,
    color: 'var(--text-primary)',
  },
  previewChips: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: 3,
  },
  previewText: {
    margin: 0,
    fontSize: 'var(--fs-body)',
    color: 'var(--text-primary)',
  },
  accents: {
    display: 'flex',
    gap: 6,
  },
  accent: {
    width: 22,
    height: 22,
    padding: 0,
    border: 'none',
    borderRadius: '50%',
    cursor: 'pointer',
  },
  accentOn: {
    outline: '2px solid var(--text-primary)',
    outlineOffset: 2,
  },
  bigBtn: {
    padding: '4px 10px',
    border: '1px solid var(--border-color)',
    borderRadius: 7,
    background: 'transparent',
    color: 'var(--text-primary)',
    fontSize: 'var(--fs-body)',
    fontWeight: 600,
    cursor: 'pointer',
  },
  bigBtnOn: {
    background: 'var(--accent-soft)',
    borderColor: 'var(--accent)',
    color: 'var(--accent)',
  },
  slider: {
    width: 130,
    accentColor: 'var(--accent)',
  },
};
