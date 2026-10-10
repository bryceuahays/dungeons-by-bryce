// What a class can be trained in: the SRD 5.2 armor categories, weapons and tools.
// The class editor offers these as checkboxes and pick lists.
//
// No imports here: tests load this file directly.

export const ARMOR = [['light', 'Light armor'], ['medium', 'Medium armor'], ['heavy', 'Heavy armor'], ['shields', 'Shields']] as const;

export const WEAPON_CATS = [['simple', 'Simple weapons'], ['martial', 'Martial weapons']] as const;

export const WEAPONS: Record<'simple' | 'martial', string[]> = {
  simple: ['Club', 'Dagger', 'Dart', 'Greatclub', 'Handaxe', 'Javelin', 'Light Crossbow', 'Light Hammer', 'Mace', 'Quarterstaff', 'Shortbow', 'Sickle', 'Sling', 'Spear'],
  martial: ['Battleaxe', 'Blowgun', 'Flail', 'Glaive', 'Greataxe', 'Greatsword', 'Halberd', 'Hand Crossbow', 'Heavy Crossbow', 'Lance', 'Longbow', 'Longsword', 'Maul', 'Morningstar', 'Musket', 'Pike', 'Pistol', 'Rapier', 'Scimitar', 'Shortsword', 'Trident', 'Warhammer', 'War Pick', 'Whip'],
};

export const TOOL_GROUPS: Record<string, string[]> = {
  "Artisan's tools": ["Alchemist's Supplies", "Brewer's Supplies", "Calligrapher's Supplies", "Carpenter's Tools", "Cartographer's Tools", "Cobbler's Tools", "Cook's Utensils", "Glassblower's Tools", "Jeweler's Tools", "Leatherworker's Tools", "Mason's Tools", "Painter's Supplies", "Potter's Tools", "Smith's Tools", "Tinker's Tools", "Weaver's Tools", "Woodcarver's Tools"],
  'Musical instruments': ['Bagpipes', 'Drum', 'Dulcimer', 'Flute', 'Horn', 'Lute', 'Lyre', 'Pan Flute', 'Shawm', 'Viol'],
  'Gaming sets': ['Dice', 'Dragonchess', 'Playing Cards', 'Three-Dragon Ante'],
  'Other tools': ['Disguise Kit', 'Forgery Kit', 'Herbalism Kit', "Navigator's Tools", "Poisoner's Kit", "Thieves' Tools"],
};

// What "the player chooses N" can choose from.
export const TOOL_CHOICES = ["Artisan's tools", 'Musical instruments', 'Gaming sets', "Artisan's tools or musical instruments", 'Any tool'];

// The SRD 5.2 languages. Druidic and Thieves' Cant come from a class, so they are listed apart.
export const LANGUAGE_GROUPS: Record<string, string[]> = {
  Standard: ['Common', 'Common Sign Language', 'Draconic', 'Dwarvish', 'Elvish', 'Giant', 'Gnomish', 'Goblin', 'Halfling', 'Orc'],
  Rare: ['Abyssal', 'Celestial', 'Deep Speech', 'Infernal', 'Primordial', 'Sylvan', 'Undercommon'],
  Secret: ['Druidic', "Thieves' Cant"],
};
export const ALL_LANGUAGES = Object.values(LANGUAGE_GROUPS).flat();
