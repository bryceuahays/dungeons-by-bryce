import { THEMES } from '@/config/themes';
import { themeStyle } from '@/lib/theme-style';
import { safeFontHref } from '@/lib/fonts';
import { HiddenBox, HiddenTag } from './Hidden';

// The shared hub looks, drawn once in each campaign theme. It is here so a new look can be
// checked in all seven themes (the light Vellum theme above all) before a page uses it.
// When a shared piece is added to this folder, add it here too. The words are made up.
export function Samples() {
  return (
    <>
      {THEMES.map((t) => {
        const fonts = safeFontHref(t.theme.fonts?.href);
        return (
          <div key={t.id} className="campaign ui-sample" style={themeStyle(t.theme)}>
            {fonts ? <link rel="stylesheet" href={fonts} precedence="default" /> : null}
            <h3>{t.name}</h3>
            <div className="ui-panel">
              <p>An ordinary card, as players see it. <span className="ui-soft">Secondary text sits a little quieter.</span></p>
              <HiddenBox>
                <p>The innkeeper is the cult&apos;s paymaster. A DM sees this box; a player&apos;s page does not contain it at all.</p>
              </HiddenBox>
              <div className="ui-row">
                <HiddenTag />
                <HiddenTag>Only Mira</HiddenTag>
                <HiddenTag>Reveals at Stage 2</HiddenTag>
              </div>
              <div className="ui-row">
                <span className="ui-chip ui-strong">Control border</span>
                <span className="ui-chip ui-gold">Selected or up now</span>
                <span className="ui-chip ui-ember">Danger</span>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
