import Link from 'next/link';
import { themeStyle } from '@/lib/theme-style';
import { safeFontHref } from '@/lib/fonts';
import { THEMES } from '@/config/themes';

export const metadata = { title: 'My character' };

// A character that is not in a campaign has no campaign theme to wear, so its sheet and
// creator use the default look every new campaign starts with.
export default function SoloCharacterLayout({ children }: { children: React.ReactNode }) {
  const theme = THEMES.find((t) => t.id === 'slate')!.theme;
  const fonts = safeFontHref(theme.fonts?.href);
  return (
    <div className="campaign" style={themeStyle(theme)}>
      {fonts ? <link rel="stylesheet" href={fonts} precedence="default" /> : null}
      <div className="strip">
        <Link href="/characters">← My characters</Link>
        <span className="tools"><span>Not in a campaign</span></span>
      </div>
      <div className="page">{children}</div>
    </div>
  );
}
