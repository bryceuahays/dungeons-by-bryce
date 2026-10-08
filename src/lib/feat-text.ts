// A feat benefit's limit as text, for the class card (server and client): "Once per turn"
const PER: Record<string, string> = { turn: 'turn', round: 'round', short: 'short or long rest', long: 'long rest', initiative: 'Initiative roll or rest' };
export const limitText = (l: any) => (l && Number(l.n) > 0 ? `${Number(l.n) === 1 ? 'Once' : l.n + ' times'} per ${PER[l.per] ?? l.per}` : ''); // eslint-disable-line @typescript-eslint/no-explicit-any
