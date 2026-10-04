export const metadata = { title: 'Legal and licences', description: 'Licence attribution, terms, and privacy for Dungeons by Bryce.', robots: { index: true, follow: true } };

export default function Legal() {
  return (
    <>
      <h1>Legal and licences</h1>

      <h2>System Reference Documents</h2>
      <div className="panel">
        <p>This work includes material taken from the System Reference Document 5.1 (&quot;SRD 5.1&quot;) by Wizards of the Coast LLC and available at <a href="https://dnd.wizards.com/resources/systems-reference-document" rel="noopener noreferrer" target="_blank">https://dnd.wizards.com/resources/systems-reference-document</a>. The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License available at <a href="https://creativecommons.org/licenses/by/4.0/legalcode" rel="noopener noreferrer" target="_blank">https://creativecommons.org/licenses/by/4.0/legalcode</a>.</p>
        <p>This work includes material from the System Reference Document 5.2.1 (&quot;SRD 5.2.1&quot;) by Wizards of the Coast LLC, available at <a href="https://www.dndbeyond.com/srd" rel="noopener noreferrer" target="_blank">https://www.dndbeyond.com/srd</a>. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at <a href="https://creativecommons.org/licenses/by/4.0/legalcode" rel="noopener noreferrer" target="_blank">https://creativecommons.org/licenses/by/4.0/legalcode</a>.</p>
        <p className="dim">The SRD material is the open rules content that comes free with every account: the races and species, classes, backgrounds, feats, spells, equipment, magic items, creatures, conditions and rules text marked &quot;SRD&quot;, in both its 2014 (SRD 5.1) and 2024 (SRD 5.2) versions. It has been reformatted for use in the character sheet, the homebrew builder and the table tools. The structured data was prepared from those documents by the open 5e-bits project (MIT licence).</p>
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
