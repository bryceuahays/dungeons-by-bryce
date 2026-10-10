// A feat benefit's or race trait's limit as text, for the cards (server and client): "Once per turn",
// "Proficiency Bonus times per long rest"
export const LIMIT_PER: [string, string][] = [['turn', 'turn'], ['round', 'round'], ['short', 'short or long rest'], ['long', 'long rest'], ['initiative', 'Initiative roll or rest']];
const PER = Object.fromEntries(LIMIT_PER);
export const limitText = (l: any) => (l && (l.n === 'prof' || Number(l.n) > 0) // eslint-disable-line @typescript-eslint/no-explicit-any
  ? `${l.n === 'prof' ? 'Proficiency Bonus times' : Number(l.n) === 1 ? 'Once' : l.n + ' times'} per ${PER[l.per] ?? l.per}` : '');
