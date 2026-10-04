export const metadata = { title: 'Legal and licences', description: 'Licence attribution, terms, and privacy for Dungeons by Bryce.' };

export default function Legal() {
  return (
    <>
      <h1>Legal and licences</h1>

      <h2>System Reference Document</h2>
      <div className="panel">
        <p>This work includes material taken from the System Reference Document 5.1 (&quot;SRD 5.1&quot;) by Wizards of the Coast LLC and available at <a href="https://dnd.wizards.com/resources/systems-reference-document" rel="noopener noreferrer" target="_blank">https://dnd.wizards.com/resources/systems-reference-document</a>. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at <a href="https://creativecommons.org/licenses/by/4.0/legalcode" rel="noopener noreferrer" target="_blank">https://creativecommons.org/licenses/by/4.0/legalcode</a>.</p>
        <p className="dim">The SRD material is the fifth edition rules content that comes with every account: the races, classes, spells, equipment and creatures marked &quot;SRD&quot;. It has been reformatted and, in places, summarised for use in the character sheet and the homebrew builder.</p>
        <p className="dim">Dungeons by Bryce is an independent product. It is fifth edition compatible. It is not affiliated with, endorsed, sponsored, or approved by Wizards of the Coast.</p>
      </div>

      <h2>Your content</h2>
      <div className="panel">
        <p>Everything else in a campaign is made by the people who use the site: their pages, homebrew, maps and notes. It belongs to them. Only upload or type in material you have the right to use.</p>
      </div>

      <h2 id="terms">Terms of service</h2>
      <div className="panel"><p className="dim">Placeholder. The terms of service will be published here before paid plans go live.</p></div>

      <h2 id="privacy">Privacy</h2>
      <div className="panel"><p className="dim">Placeholder. The privacy policy will be published here before paid plans go live.</p></div>
    </>
  );
}
