/* City Fun Time: the game's content. Everything here is data: stats, pickups, place kinds, shop items, vehicles,
   homes, businesses, crews, the sticker album, the cast and every mission. cft-game.js runs it.
   Text tokens: {name} player, {place} the step's place, {home}, {street}, {pt} girlfriend/boyfriend,
   {he} {him} {his} {He} Sam's pronouns, {kid} first child, {biz} first business, {turf} the turf's name. */
(function () {
'use strict';
const D = {};

D.STATS = [
  { id: 'fit', name: 'Fitness', e: '💪', color: '#ff6b4a', blurb: 'Run faster and keep more energy.' },
  { id: 'charm', name: 'Charm', e: '💬', color: '#ff5c8a', blurb: 'People like you more. Dates go better.' },
  { id: 'smarts', name: 'Smarts', e: '🧠', color: '#3b82f6', blurb: 'Businesses earn more. You learn faster.' },
  { id: 'style', name: 'Style', e: '🕶️', color: '#a855f7', blurb: 'Shops give you discounts. You look great.' },
  { id: 'cred', name: 'Street cred', e: '🔥', color: '#f59e0b', blurb: 'Crews respect you. Turf pays more.' },
];

// World pickups. w = spawn weight (0 = only for missions). Stat pickups add a quarter of a point.
D.PICKUPS = {
  coin: { e: '🪙', n: 'Coin', bg: '#ffd54a', w: 46, money: [1, 4] },
  cash: { e: '💵', n: 'Cash', bg: '#a7f3b5', w: 4, money: [15, 35] },
  coffee: { e: '☕', n: 'Coffee', bg: '#f3e2c7', w: 8, energy: 18 },
  book: { e: '📚', n: 'Book', bg: '#cfe3ff', w: 6, stat: 'smarts' },
  rose: { e: '🌹', n: 'Rose', bg: '#ffd1dc', w: 6, stat: 'charm' },
  dumbbell: { e: '🏋️', n: 'Dumbbell', bg: '#ffd9c7', w: 6, stat: 'fit' },
  shades: { e: '🕶️', n: 'Shades', bg: '#e9ddff', w: 5, stat: 'style' },
  spray: { e: '🎨', n: 'Spray can', bg: '#c8f5e8', w: 6, stat: 'cred', item: 'spray' },
  star: { e: '⭐', n: 'Star', bg: '#fff1a8', w: 5, xp: 20 },
  pack: { e: '🎴', n: 'Sticker pack', bg: '#ffe0f0', w: 4, sticker: 1 },
  gem: { e: '💎', n: 'Gem', bg: '#c9f1ff', w: 1, money: [80, 160], happy: 3 },
  // mission-only
  herb: { e: '🌿', n: 'Fresh basil', bg: '#d6f5c8', w: 0 },
  cart: { e: '👾', n: 'Game cartridge', bg: '#e0d4ff', w: 0 },
  vinyl: { e: '💿', n: 'Rare record', bg: '#e5e7eb', w: 0 },
  ball: { e: '🎾', n: 'Tennis ball', bg: '#ecfccb', w: 0 },
  part: { e: '⚙️', n: 'Spare part', bg: '#e2e8f0', w: 0 },
  teddy: { e: '🧸', n: 'Mr. Snuggles', bg: '#fde2c4', w: 0 },
  clue: { e: '🔍', n: 'Clue', bg: '#fef3c7', w: 0 },
  lemon: { e: '🍋', n: 'Lemon', bg: '#fef9c3', w: 0 },
  note: { e: '🎵', n: 'Lost melody', bg: '#e0f2fe', w: 0 },
  egg: { e: '🥚', n: 'Golden egg', bg: '#fef3c7', w: 0 },
  key: { e: '🔑', n: 'Lost key', bg: '#fde68a', w: 0 },
  leaf: { e: '🍁', n: 'Perfect leaf', bg: '#fed7aa', w: 0 },
  badge: { e: '📛', n: 'Name tag', bg: '#fecaca', w: 0 },
  bone: { e: '🦴', n: 'Bone', bg: '#f5f5f4', w: 0 },
  battery: { e: '🔋', n: 'Battery', bg: '#d9f99d', w: 0 },
  glitter: { e: '✨', n: 'Glitter', bg: '#fbcfe8', w: 0 },
};

// Kinds of places. Real map places get these; when an area lacks one, the game opens a made-up one in a real building.
D.KINDS = {
  cafe: { e: '☕', n: 'Café', fake: ['Café Lune', 'The Daily Grind', 'Bean There', 'Brew Haven', 'Café Mistral', 'Perk Up'], sells: ['coffee', 'latte', 'croissant', 'muffin', 'cookie'] },
  restaurant: { e: '🍽️', n: 'Restaurant', fake: ['Chez Mimi', 'Trattoria Nonna', 'The Hungry Fork', 'Bistro Bleu', 'Golden Wok'], sells: ['meal', 'pasta', 'feast'] },
  fastfood: { e: '🍔', n: 'Fast food', fake: ['Burger Barn', 'Frites Express', 'Poutine Palace', 'Taco Rocket'], sells: ['burger', 'fries', 'poutine'] },
  bakery: { e: '🥐', n: 'Bakery', fake: ['Le Petit Four', 'Rise & Shine', 'Crumbs', 'Boulangerie Soleil'], sells: ['baguette', 'donut', 'cannoli', 'cake'] },
  icecream: { e: '🍦', n: 'Ice cream', fake: ['Scoops Ahoy', 'Polar Pals', 'Gelato Gelato'], sells: ['icecream', 'sundae'] },
  lounge: { e: '🎶', n: 'Lounge', fake: ['The Velvet Groove', 'Neon Owl', 'Club Disco Ball'], sells: ['mocktail', 'karaoke'] },
  grocery: { e: '🛒', n: 'Grocery', fake: ['Fresh Mart', 'Corner Dépanneur', 'Green Basket'], sells: ['apple', 'energybar', 'groceries', 'spraycan', 'picnic'] },
  clothes: { e: '👕', n: 'Clothes', fake: ['Thread Lightly', 'Urban Closet', 'Fit Check'], sells: ['tee', 'sneakers1', 'jacket', 'sneakers2', 'outfit_date', 'suit', 'sneakers3', 'designer'] },
  flowers: { e: '💐', n: 'Florist', fake: ['Petal Pushers', 'Bloom Room', 'Fleurs de Sam'], sells: ['bouquet', 'plant', 'orchid'] },
  books: { e: '📖', n: 'Bookshop', fake: ['Dog-Eared Books', 'Chapter & Verse', 'Page Turner'], sells: ['novel', 'textbook', 'pack', 'comic'] },
  library: { e: '🏛️', n: 'Library', fake: ['Public Library', 'Neighbourhood Library'], sells: ['study'] },
  tech: { e: '📱', n: 'Tech shop', fake: ['Gizmo Hut', 'Pixel Palace', 'Byte Me'], sells: ['phone2', 'phone3', 'headphones', 'console', 'laptop', 'camera'] },
  pharmacy: { e: '💊', n: 'Pharmacy', fake: ['Pharma Plus', 'Remedy Corner'], sells: ['vitamins', 'energydrink', 'bandage'] },
  school: { e: '🏫', n: 'School', fake: ['City Community College', 'Night School'], sells: ['class', 'license_moped', 'license_car', 'mba'] },
  park: { e: '🌳', n: 'Park', fake: ['Pocket Park', 'Little Green'], sells: [] },
  cinema: { e: '🎬', n: 'Cinema & theatre', fake: ['The Bijou', 'Starlight Cinema'], sells: ['movie', 'show'] },
  museum: { e: '🖼️', n: 'Museum & gallery', fake: ['City Gallery', 'Museum of Odd Things'], sells: ['museum'] },
  clinic: { e: '🏥', n: 'Clinic', fake: ['Neighbourhood Clinic'], sells: ['checkup'] },
  bank: { e: '🏦', n: 'Bank', fake: ['Piggy Bank & Trust', 'First Neighbourhood Bank'], sells: [] },
  post: { e: '📮', n: 'Post office', fake: ['Post Office'], sells: [] },
  salon: { e: '💇', n: 'Salon', fake: ['Shear Genius', 'Curl Up & Dye', 'Hair Force One'], sells: ['haircut', 'makeover'] },
  bike: { e: '🚲', n: 'Bike & board shop', fake: ['Spoke Folk', 'Wheelie Good', 'Deck the Halls'], sells: ['skateboard', 'kickscooter', 'bicycle', 'helmet'] },
  garage: { e: '🚗', n: 'Garage & dealer', fake: ["Dmitri's Garage", 'Wheels Deals', 'Vroom Room'], sells: ['moped', 'car', 'suv', 'sports'] },
  community: { e: '🏘️', n: 'Community centre', fake: ['Community Centre', 'Town Hall'], sells: [] },
  gym: { e: '🏋️', n: 'Gym', fake: ['Iron Paradise', 'Flex Appeal', 'Sweat Shop'], sells: ['workout', 'protein', 'yoga'] },
  stadium: { e: '🏟️', n: 'Stadium', fake: ['City Stadium'], sells: ['game'] },
  landmark: { e: '🗽', n: 'Landmark', fake: ['The Old Clock Tower', 'Lookout Point'], sells: [] },
  music: { e: '🎸', n: 'Music shop', fake: ['Strings Attached', 'Vinyl Countdown'], sells: ['guitar', 'records'] },
  jewelry: { e: '💍', n: 'Jeweller', fake: ['Carats & Co.', 'Sparkle Lane'], sells: ['ring', 'necklace', 'watch'] },
  toys: { e: '🧸', n: 'Toy shop', fake: ['Toy Box', 'Fun Factory'], sells: ['toy', 'kite', 'plushie'] },
  pet: { e: '🐾', n: 'Pet shop', fake: ['Paws & Claws', 'The Barkery'], sells: ['dog', 'cat', 'treats'] },
  furniture: { e: '🛋️', n: 'Furniture', fake: ['Sofa So Good', 'Nest & Co.'], sells: ['plant_home', 'sofa', 'tv', 'bed', 'art', 'crib', 'aquarium', 'piano', 'hottub'] },
  gift: { e: '🎁', n: 'Gift shop', fake: ['Knick Knacks', 'The Souvenir Spot'], sells: ['chocolates', 'pack', 'souvenir', 'spraycan'] },
  hotel: { e: '🏨', n: 'Hotel', fake: ['Grand Hotel'], sells: ['spa'] },
  laundry: { e: '🧺', n: 'Laundromat', fake: ['Suds City'], sells: ['wash'] },
  hardware: { e: '🔨', n: 'Hardware', fake: ['Nuts & Bolts'], sells: ['spraycan', 'toolkit'] },
  metro: { e: '🚇', n: 'Metro', fake: ['Metro station'], sells: [] },
};

// Shop items. type: food (eaten now), snack (bag, eat later), gift (bag, give to someone), gear (wear: slot),
// vehicle, furniture (home: needs an apartment tier), pet, service (instant effect), license, quest.
D.ITEMS = {
  coffee: { n: 'Coffee', e: '☕', p: 4, type: 'food', energy: 30 },
  latte: { n: 'Fancy latte', e: '🥛', p: 7, type: 'food', energy: 40, happy: 2 },
  croissant: { n: 'Croissant', e: '🥐', p: 5, type: 'food', energy: 25 },
  muffin: { n: 'Blueberry muffin', e: '🧁', p: 5, type: 'snack', energy: 25 },
  cookie: { n: 'Giant cookie', e: '🍪', p: 3, type: 'snack', energy: 15, happy: 1 },
  meal: { n: 'Plat du jour', e: '🍲', p: 18, type: 'food', energy: 60, happy: 3 },
  pasta: { n: 'Pasta for two', e: '🍝', p: 32, type: 'food', energy: 70, happy: 6 },
  feast: { n: "Chef's tasting menu", e: '🍽️', p: 120, type: 'food', energy: 100, happy: 15 },
  burger: { n: 'Burger', e: '🍔', p: 9, type: 'food', energy: 45 },
  fries: { n: 'Fries', e: '🍟', p: 4, type: 'snack', energy: 20 },
  poutine: { n: 'Poutine', e: '🍛', p: 11, type: 'food', energy: 55, happy: 3 },
  baguette: { n: 'Baguette', e: '🥖', p: 4, type: 'snack', energy: 20 },
  donut: { n: 'Sprinkle donut', e: '🍩', p: 3, type: 'snack', energy: 15, happy: 1 },
  cannoli: { n: 'Cannoli', e: '🥮', p: 5, type: 'gift', rel: 4 },
  cake: { n: 'Celebration cake', e: '🎂', p: 35, type: 'gift', rel: 12 },
  icecream: { n: 'Ice cream cone', e: '🍦', p: 5, type: 'food', energy: 15, happy: 4 },
  sundae: { n: 'Mega sundae', e: '🍨', p: 12, type: 'food', energy: 30, happy: 7 },
  mocktail: { n: 'Neon mocktail', e: '🍹', p: 8, type: 'food', energy: 10, happy: 4, stats: { charm: 0.1 } },
  karaoke: { n: 'Karaoke slot', e: '🎤', p: 15, type: 'service', happy: 8, stats: { charm: 0.5 } },
  apple: { n: 'Apple', e: '🍎', p: 2, type: 'snack', energy: 12 },
  energybar: { n: 'Energy bar', e: '🍫', p: 4, type: 'snack', energy: 35 },
  groceries: { n: 'Bag of groceries', e: '🛍️', p: 25, type: 'snack', energy: 80, happy: 2 },
  spraycan: { n: 'Spray can', e: '🎨', p: 6, type: 'snack', give: 'spray' },
  picnic: { n: 'Picnic basket', e: '🧺', p: 30, type: 'gift', rel: 8 },
  tee: { n: 'Graphic tee', e: '👕', p: 25, type: 'gear', slot: 'outfit', stats: { style: 1 }, color: 0x3aa6b9 },
  jacket: { n: 'Denim jacket', e: '🧥', p: 80, type: 'gear', slot: 'outfit', stats: { style: 3 }, color: 0x2b4c7e },
  outfit_date: { n: 'Date-night outfit', e: '👗', p: 160, type: 'gear', slot: 'outfit', stats: { style: 5, charm: 1 }, color: 0x9b2c4f },
  suit: { n: 'Sharp suit', e: '🤵', p: 450, type: 'gear', slot: 'outfit', stats: { style: 8, charm: 2 }, color: 0x1f2937 },
  designer: { n: 'Designer fit', e: '💃', p: 2500, type: 'gear', slot: 'outfit', stats: { style: 15, charm: 3 }, color: 0xef6aa5 },
  sneakers1: { n: 'Comfy sneakers', e: '👟', p: 40, type: 'gear', slot: 'shoes', speed: 0.06 },
  sneakers2: { n: 'Runner pro shoes', e: '🥾', p: 220, type: 'gear', slot: 'shoes', speed: 0.12, stats: { fit: 1 } },
  sneakers3: { n: 'Rocket kicks', e: '🚀', p: 1200, type: 'gear', slot: 'shoes', speed: 0.2, stats: { fit: 2, style: 2 } },
  helmet: { n: 'Cool helmet', e: '⛑️', p: 45, type: 'gear', slot: 'hat', stats: { cred: 1 } },
  bouquet: { n: 'Bouquet', e: '💐', p: 22, type: 'gift', rel: 8 },
  plant: { n: 'Potted fern', e: '🪴', p: 15, type: 'gift', rel: 4 },
  orchid: { n: 'Rare orchid', e: '🌺', p: 60, type: 'gift', rel: 15 },
  novel: { n: 'Page-turner novel', e: '📕', p: 14, type: 'service', stats: { smarts: 0.5 }, happy: 2 },
  textbook: { n: 'Big textbook', e: '📘', p: 45, type: 'service', stats: { smarts: 1.5 } },
  comic: { n: 'Comic book', e: '🦸', p: 6, type: 'gift', rel: 5 },
  pack: { n: 'Sticker pack', e: '🎴', p: 15, type: 'service', sticker: 1 },
  study: { n: 'Study session (1 h)', e: '✏️', p: 0, type: 'service', stats: { smarts: 0.5 }, energy: -15, hours: 1 },
  class: { n: 'Evening class', e: '🎓', p: 60, type: 'service', stats: { smarts: 2 }, energy: -20, hours: 2 },
  mba: { n: 'Business diploma', e: '📜', p: 5000, type: 'service', stats: { smarts: 10 }, energy: -40, hours: 6, once: true },
  license_moped: { n: 'Scooter licence', e: '🪪', p: 120, type: 'license', req: { m: 'c3-license' } },
  license_car: { n: "Driver's licence", e: '🪪', p: 600, type: 'license', req: { lvl: 12 } },
  phone2: { n: 'Smartphone', e: '📱', p: 60, type: 'gear', slot: 'phone', radar: 1 },
  phone3: { n: 'Pro phone', e: '📲', p: 900, type: 'gear', slot: 'phone', radar: 2, stats: { smarts: 1, style: 1 } },
  headphones: { n: 'Big headphones', e: '🎧', p: 90, type: 'gear', slot: 'acc', stats: { style: 2 }, happy: 3 },
  console: { n: 'Game console', e: '🎮', p: 400, type: 'furniture', happy: 6, apt: 1 },
  laptop: { n: 'Laptop', e: '💻', p: 800, type: 'gear', slot: 'bag', stats: { smarts: 3 } },
  camera: { n: 'Fancy camera', e: '📷', p: 350, type: 'gear', slot: 'acc', stats: { style: 1, smarts: 1 } },
  vitamins: { n: 'Vitamins', e: '💊', p: 20, type: 'service', maxEnergy: 5 },
  energydrink: { n: 'Energy drink', e: '🥤', p: 6, type: 'snack', energy: 50 },
  bandage: { n: 'Bandages', e: '🩹', p: 5, type: 'snack', energy: 10 },
  movie: { n: 'Movie ticket', e: '🍿', p: 14, type: 'service', happy: 6, hours: 2 },
  show: { n: 'Theatre show', e: '🎭', p: 60, type: 'service', happy: 10, stats: { smarts: 0.5, style: 0.5 }, hours: 3 },
  museum: { n: 'Museum visit', e: '🏺', p: 18, type: 'service', happy: 4, stats: { smarts: 1 }, hours: 1 },
  checkup: { n: 'Check-up', e: '🩺', p: 0, type: 'service', energy: 40, happy: 2 },
  haircut: { n: 'Fresh haircut', e: '✂️', p: 30, type: 'service', stats: { style: 1 }, happy: 2 },
  makeover: { n: 'Full makeover', e: '💄', p: 250, type: 'service', stats: { style: 4, charm: 1 }, happy: 5 },
  skateboard: { n: 'Skateboard', e: '🛹', p: 120, type: 'vehicle' },
  kickscooter: { n: 'Kick scooter', e: '🛴', p: 220, type: 'vehicle' },
  bicycle: { n: 'Bicycle', e: '🚲', p: 450, type: 'vehicle' },
  moped: { n: 'Vespa-style scooter', e: '🛵', p: 2400, type: 'vehicle', req: { item: 'license_moped' } },
  car: { n: 'Compact car', e: '🚗', p: 14000, type: 'vehicle', req: { item: 'license_car' } },
  suv: { n: 'Family SUV', e: '🚙', p: 32000, type: 'vehicle', req: { item: 'license_car' } },
  sports: { n: 'Sports car', e: '🏎️', p: 95000, type: 'vehicle', req: { item: 'license_car' } },
  workout: { n: 'Personal training', e: '🏋️', p: 25, type: 'service', stats: { fit: 1 }, energy: -25, hours: 1 },
  yoga: { n: 'Yoga class', e: '🧘', p: 20, type: 'service', stats: { fit: 0.5 }, happy: 4, hours: 1 },
  protein: { n: 'Protein shake', e: '🥤', p: 8, type: 'food', energy: 35, stats: { fit: 0.1 } },
  game: { n: 'Game ticket', e: '🎟️', p: 45, type: 'service', happy: 10, stats: { cred: 0.5 }, hours: 3 },
  guitar: { n: 'Guitar', e: '🎸', p: 300, type: 'furniture', happy: 5, apt: 1, stats: { charm: 1 } },
  records: { n: 'Vinyl records', e: '💿', p: 30, type: 'gift', rel: 7 },
  ring: { n: 'Engagement ring', e: '💍', p: 2500, type: 'quest' },
  necklace: { n: 'Necklace', e: '📿', p: 300, type: 'gift', rel: 25 },
  watch: { n: 'Gold watch', e: '⌚', p: 1500, type: 'gear', slot: 'acc', stats: { style: 4, smarts: 1 } },
  toy: { n: 'Toy robot', e: '🤖', p: 25, type: 'gift', rel: 10 },
  kite: { n: 'Kite', e: '🪁', p: 18, type: 'gift', rel: 8 },
  plushie: { n: 'Plush dino', e: '🦖', p: 20, type: 'gift', rel: 9 },
  dog: { n: 'Adopt a dog', e: '🐕', p: 150, type: 'pet', pet: 'dog', apt: 1 },
  cat: { n: 'Adopt a cat', e: '🐈', p: 120, type: 'pet', pet: 'cat', apt: 1 },
  treats: { n: 'Pet treats', e: '🦴', p: 6, type: 'service', happy: 3 },
  plant_home: { n: 'Big houseplant', e: '🪴', p: 30, type: 'furniture', happy: 2, apt: 1 },
  sofa: { n: 'Comfy sofa', e: '🛋️', p: 400, type: 'furniture', happy: 4, apt: 1 },
  tv: { n: 'Huge TV', e: '📺', p: 700, type: 'furniture', happy: 5, apt: 1 },
  bed: { n: 'King-size bed', e: '🛏️', p: 900, type: 'furniture', happy: 5, apt: 2, energy: 20 },
  art: { n: 'Original painting', e: '🖼️', p: 1500, type: 'furniture', happy: 6, apt: 2, stats: { style: 1 } },
  crib: { n: 'Baby crib', e: '🍼', p: 350, type: 'furniture', happy: 2, apt: 3 },
  aquarium: { n: 'Aquarium', e: '🐠', p: 2200, type: 'furniture', happy: 8, apt: 3 },
  piano: { n: 'Grand piano', e: '🎹', p: 12000, type: 'furniture', happy: 12, apt: 4, stats: { charm: 2, smarts: 1 } },
  hottub: { n: 'Hot tub', e: '♨️', p: 25000, type: 'furniture', happy: 15, apt: 5 },
  chocolates: { n: 'Box of chocolates', e: '🍫', p: 18, type: 'gift', rel: 7 },
  souvenir: { n: 'Snow globe', e: '🔮', p: 12, type: 'gift', rel: 5 },
  spa: { n: 'Spa day', e: '🧖', p: 180, type: 'service', energy: 100, happy: 12, hours: 3 },
  wash: { n: 'Laundry', e: '🧺', p: 6, type: 'service', happy: 2, stats: { style: 0.2 } },
  toolkit: { n: 'Toolkit', e: '🧰', p: 70, type: 'gear', slot: 'bag', stats: { smarts: 1 } },
  // quest items (given by missions)
  bread: { n: 'Warm bread', e: '🍞', p: 0, type: 'quest' },
  flyers: { n: 'Flyers', e: '📄', p: 0, type: 'quest' },
  package: { n: 'Package', e: '📦', p: 0, type: 'quest' },
  pizza: { n: 'Pizza box', e: '🍕', p: 0, type: 'quest' },
  letter: { n: 'Letter', e: '✉️', p: 0, type: 'quest' },
  amp: { n: 'Guitar amp', e: '🔊', p: 0, type: 'quest' },
  overdue: { n: 'Overdue book', e: '📗', p: 0, type: 'quest' },
  invite: { n: 'Invitation', e: '💌', p: 0, type: 'quest' },
  medicine: { n: 'Medicine', e: '💊', p: 0, type: 'quest' },
  sauce: { n: "Nonna's sauce", e: '🫙', p: 0, type: 'quest' },
  key_city: { n: 'Key to the City', e: '🗝️', p: 0, type: 'quest' },
  spray: { n: 'Spray can', e: '🎨', p: 0, type: 'tool' },
};

// How rides move (W.setRide). walk = cruise speed, run = with Shift (m/s).
D.VEHICLES = {
  skateboard: { mode: 'ride', walk: 9.5, run: 14.5, jump: 7.5, radius: 0.4, color: 0xff5c8a },
  kickscooter: { mode: 'ride', walk: 10.5, run: 15, jump: 0, radius: 0.4, color: 0x3aa6b9 },
  bicycle: { mode: 'ride', kind: 'bike', walk: 12.5, run: 18, jump: 0, radius: 0.5, color: 0x2f9e6e },
  moped: { mode: 'drive', walk: 17, run: 23.5, radius: 0.6, turn: 2.6, accel: 9, color: 0x7fd1c7 },
  car: { mode: 'drive', walk: 21, run: 30, radius: 1.0, turn: 2.0, accel: 11, color: 0xf2b134 },
  suv: { mode: 'drive', walk: 21, run: 29, radius: 1.1, turn: 1.8, accel: 10, color: 0x2b6cb0 },
  sports: { mode: 'drive', walk: 28, run: 44, radius: 1.0, turn: 2.2, accel: 17, color: 0xe8453c },
};
D.WALK = { walk: 6.2, run: 12.5 };

D.APARTMENTS = [
  { tier: 0, n: "Cousin Max's couch", e: '🛋️', cost: 0, rent: 0, happy: 0, kids: 0, pick: 'start', blurb: 'Lumpy, borrowed, and smells faintly of guitar strings.' },
  { tier: 1, n: 'Basement studio', e: '🛏️', cost: 250, rent: 25, happy: 4, kids: 0, pick: { hMin: 5, hMax: 18 }, blurb: 'Small and a little damp, but all yours.' },
  { tier: 2, n: 'Sunny one-bedroom', e: '🪟', cost: 900, rent: 70, happy: 8, kids: 0, partner: true, pick: { hMin: 8, hMax: 26 }, blurb: 'Big windows. Room for two toothbrushes.' },
  { tier: 3, n: 'Two-bedroom with balcony', e: '🌿', cost: 3500, rent: 150, happy: 12, kids: 1, partner: true, pick: { hMin: 9, hMax: 34, aMin: 220 }, blurb: 'A balcony for tomatoes and a spare room for a crib.' },
  { tier: 4, n: 'Converted loft', e: '🏭', cost: 60000, rent: 0, happy: 18, kids: 2, partner: true, pick: { hMin: 10, hMax: 45, aMin: 600 }, blurb: 'Brick walls, steel beams, room for a piano. Bought, not rented.' },
  { tier: 5, n: 'Townhouse with garden', e: '🏡', cost: 160000, rent: 0, happy: 24, kids: 3, partner: true, pick: 'house', blurb: 'A front door with your name on it and a yard for the dog.' },
  { tier: 6, n: 'Penthouse', e: '🌇', cost: 550000, rent: 0, happy: 34, kids: 3, partner: true, pick: 'tallest', blurb: 'The top floor of the tallest building around. The whole city at your feet.' },
];

// income: $ per game hour at level 1. Upgrades multiply it; a manager collects the till for you.
D.BUSINESSES = [
  { id: 'lemonade', n: 'Lemonade stand', e: '🍋', cost: 60, income: 6, up: ['Bigger pitcher', 'Pink lemonade', 'Umbrella & chairs', 'Lemon franchise'], deliver: 'lemonade' },
  { id: 'dogwalk', n: 'Dog walking service', e: '🐕', cost: 300, income: 18, up: ['More leashes', 'Treat pouch', 'Doggy daycare', 'Pack of ten'], deliver: 'dog' },
  { id: 'bikeshop', n: 'Bike repair shop', e: '🔧', cost: 1500, income: 45, up: ['Tool wall', 'Mobile repairs', 'Rental fleet', 'Pro mechanics'], deliver: 'package' },
  { id: 'laundromat', n: 'Laundromat', e: '🧺', cost: 4000, income: 80, up: ['Extra dryers', 'Folding service', 'Comfy lounge', 'Pickup & delivery'], deliver: 'package' },
  { id: 'coffee', n: 'Coffee bar', e: '☕', cost: 8000, income: 140, up: ['Espresso machine', 'Latte art', 'Pastry case', 'Roast your own'], deliver: 'coffee' },
  { id: 'foodtruck', n: 'Taco truck', e: '🌮', cost: 15000, income: 220, up: ['Secret salsa', 'Second truck', 'Festival permit', 'Taco Tuesday fame'], deliver: 'pizza' },
  { id: 'cleaning', n: 'Sparkle cleaning crew', e: '🧽', cost: 25000, income: 300, up: ['Eco soap', 'Window team', 'Office contracts', 'Spotless reputation'], deliver: 'package' },
  { id: 'pizzeria', n: 'Pizzeria', e: '🍕', cost: 45000, income: 500, up: ['Wood-fired oven', "Nonna's recipe", 'Delivery bikes', 'Famous slice'], deliver: 'pizza' },
  { id: 'salon', n: 'Hair salon', e: '💇', cost: 60000, income: 620, up: ['Star stylist', 'Colour bar', 'Nail studio', 'Celebrity clients'], deliver: 'package' },
  { id: 'phonefix', n: 'Phone repair', e: '📱', cost: 80000, income: 760, up: ['Screen machine', 'Same-day repair', 'Refurb shop', 'Gadget empire'], deliver: 'package' },
  { id: 'sushi', n: 'Sushi bar', e: '🍣', cost: 120000, income: 1100, up: ['Master chef', 'Conveyor belt', 'Omakase nights', 'Michelin whispers'], deliver: 'pizza' },
  { id: 'gym', n: 'Boutique gym', e: '🏋️', cost: 200000, income: 1600, up: ['New weights', 'Spin studio', 'Smoothie bar', 'Celebrity trainer'], deliver: 'package' },
  { id: 'karaoke', n: 'Karaoke lounge', e: '🎤', cost: 320000, income: 2300, up: ['Private rooms', 'Light show', 'Live band night', 'Famous on the internet'], deliver: 'package' },
  { id: 'bistro', n: 'Fine-dining bistro', e: '🍽️', cost: 650000, income: 4200, up: ['Sommelier of juice', 'Tasting menu', 'Rooftop terrace', 'Three stars'], deliver: 'pizza' },
  { id: 'hotel', n: 'Boutique hotel', e: '🏨', cost: 1500000, income: 9000, up: ['Lobby makeover', 'Rooftop pool', 'Spa floor', 'Five stars'], deliver: 'package' },
];

// Rival crews. Each turf belongs to one until you win it. challenge: race | dance | quiz | chase | cred
D.CREWS = [
  { id: 'pigeons', n: 'The Pigeon Mafia', e: '🐦', color: '#8b8f9c', boss: 'Don Coo-leone', ch: 'chase', taunt: 'This block belongs to the birds, capisce? Catch me if you can!', lose: 'Coo... fine. The crumbs are yours.', look: { shirt: 0x5c6f8a, pants: 0x1f2937, hat: 0x1f2937, glasses: true } },
  { id: 'latte', n: 'The Latte Lords', e: '☕', color: '#a0715a', boss: 'Barista Bianca', ch: 'quiz', taunt: 'Nobody takes our block without knowing their stuff. Quiz time.', lose: 'Well brewed. Respect.', look: { shirt: 0xa0715a, pants: 0x3a2618, apron: 0xf4f1ea, long: true } },
  { id: 'skaterats', n: 'Skate Rats', e: '🛹', color: '#ef6aa5', boss: 'Kickflip Kenny', ch: 'race', taunt: 'Race me to the checkpoints, slowpoke!', lose: 'Gnarly. You earned the block.', look: { shirt: 0xef6aa5, pants: 0x24324a, hat: 0xf2b134 } },
  { id: 'grannies', n: 'The Bingo Grannies', e: '🧶', color: '#c084fc', boss: 'Granny Smith', ch: 'quiz', taunt: 'Sit down, dearie. Answer my questions and the block is yours.', lose: 'Oh, you clever thing. Come for cookies on Sunday.', look: { shirt: 0xc084fc, pants: 0x8a8a8a, hair: 0xd9d4cc, glasses: true, dress: true } },
  { id: 'buskers', n: 'The Busker Union', e: '🎻', color: '#f59e0b', boss: "Fiddlin' Phil", ch: 'dance', taunt: 'Dance-off! Keep up with my fiddle!', lose: 'You got rhythm, friend.', look: { shirt: 0xf59e0b, pants: 0x5b4636, beard: true, hat: 0x5b4636 } },
  { id: 'squirrels', n: 'The Squirrel Syndicate', e: '🐿️', color: '#b45309', boss: 'Nutsy', ch: 'chase', taunt: 'You want my nuts? Catch me first!', lose: 'Okay okay, you win! Here, have an acorn.', look: { shirt: 0xb45309, pants: 0x5b4636, hat: 0xb45309 } },
  { id: 'spandex', n: 'The Spandex Squad', e: '🚴', color: '#22c55e', boss: 'Lance Pedalton', ch: 'race', taunt: 'Clip in. Hit every checkpoint. Try not to cry.', lose: 'Impressive cadence. The block is yours.', look: { shirt: 0x22c55e, pants: 0x111111, hat: 0xffffff } },
  { id: 'donuts', n: 'The Donut Patrol', e: '🍩', color: '#ec4899', boss: 'Officer Sprinkles', ch: 'cred', taunt: 'Only someone with real street cred runs this block.', lose: 'Fair and square. Have a sprinkle.', look: { shirt: 0x24324a, pants: 0x24324a, hat: 0x24324a } },
  { id: 'murals', n: 'The Mural Mob', e: '🎨', color: '#14b8a6', boss: 'Spray Rae', ch: 'dance', taunt: 'Art is rhythm. Show me yours.', lose: 'Okay, artist. Paint the town.', look: { shirt: 0x14b8a6, pants: 0x1f2937, long: true, bag: 0xf2b134 } },
  { id: 'dogpark', n: 'The Dog Park Posse', e: '🐕', color: '#84cc16', boss: 'Barkley', ch: 'chase', taunt: "Bet you can't catch me. My dogs can't either!", lose: 'Good human. Very good human.', look: { shirt: 0x84cc16, pants: 0x5b4636 } },
  { id: 'influencers', n: 'The Influencer Clique', e: '📸', color: '#f472b6', boss: 'Kayleigh Klicks', ch: 'cred', taunt: 'Like, do you even have followers? Street cred, babe.', lose: 'OMG. Fine. Tagging you as the new queen of the block.', look: { shirt: 0xf472b6, pants: 0xf4f1ea, long: true, glasses: true } },
  { id: 'oldmoney', n: 'The Old Money Club', e: '🎩', color: '#64748b', boss: 'Sir Reginald Pennywise', ch: 'quiz', taunt: 'A gentleman settles matters with wit. Answer, if you can.', lose: 'Jolly good show. The block is yours, old sport.', look: { shirt: 0x1f2937, pants: 0x1f2937, hat: 0x111111, glasses: true, beard: true } },
];

// The sticker album: 12 sets x 6. Completing a set gives a bonus forever.
D.STICKER_SETS = [
  { id: 'critters', n: 'City Critters', bonus: { stats: { charm: 2 } }, bonusText: '+2 Charm', items: [['pigeon', '🐦', 'Pigeon'], ['squirrel', '🐿️', 'Squirrel'], ['raccoon', '🦝', 'Raccoon'], ['rat', '🐀', 'Subway rat'], ['alleycat', '🐈', 'Alley cat'], ['poodle', '🐩', 'Fancy poodle']] },
  { id: 'eats', n: 'Street Eats', bonus: { food: 0.25 }, bonusText: 'Food gives 25% more energy', items: [['hotdog', '🌭', 'Hot dog'], ['bagel', '🥯', 'Bagel'], ['slice', '🍕', 'Pizza slice'], ['taco', '🌮', 'Taco'], ['fries', '🍟', 'Frites'], ['pretzel', '🥨', 'Pretzel']] },
  { id: 'sweet', n: 'Sweet Tooth', bonus: { happy: 5 }, bonusText: '+5 happiness, always', items: [['donut', '🍩', 'Donut'], ['cupcake', '🧁', 'Cupcake'], ['cone', '🍦', 'Soft serve'], ['cookie', '🍪', 'Cookie'], ['croissant', '🥐', 'Croissant'], ['choco', '🍫', 'Chocolate']] },
  { id: 'transit', n: 'Getting Around', bonus: { speed: 0.05 }, bonusText: 'Everything rides 5% faster', items: [['bus', '🚌', 'Bus'], ['metro', '🚇', 'Metro'], ['taxi', '🚕', 'Taxi'], ['bike', '🚲', 'Bike'], ['scooter', '🛴', 'Scooter'], ['tram', '🚋', 'Tram']] },
  { id: 'night', n: 'Night Life', bonus: { stats: { style: 2 } }, bonusText: '+2 Style', items: [['sax', '🎷', 'Saxophone'], ['mic', '🎤', 'Microphone'], ['disco', '🪩', 'Disco ball'], ['guitar', '🎸', 'Guitar'], ['headphones', '🎧', 'Headphones'], ['mocktail', '🍹', 'Mocktail']] },
  { id: 'park', n: 'Park Life', bonus: { energy: 10 }, bonusText: '+10 max energy', items: [['tree', '🌳', 'Old oak'], ['tulip', '🌷', 'Tulip'], ['duck', '🦆', 'Duck'], ['kite', '🪁', 'Kite'], ['fountain', '⛲', 'Fountain'], ['picnic', '🧺', 'Picnic']] },
  { id: 'seasons', n: 'Four Seasons', bonus: { xp: 0.1 }, bonusText: '+10% XP', items: [['snow', '❄️', 'Snowflake'], ['maple', '🍁', 'Maple leaf'], ['blossom', '🌸', 'Blossom'], ['sunny', '☀️', 'Sunshine'], ['rain', '🌧️', 'Rain cloud'], ['rainbow', '🌈', 'Rainbow']] },
  { id: 'sports', n: 'Sports Fan', bonus: { stats: { fit: 2 } }, bonusText: '+2 Fitness', items: [['soccer', '⚽', 'Soccer'], ['hoops', '🏀', 'Basketball'], ['skate', '⛸️', 'Skating'], ['hockey', '🏒', 'Hockey'], ['tennis', '🎾', 'Tennis'], ['board', '🛹', 'Skateboard']] },
  { id: 'arts', n: 'Artsy', bonus: { stats: { smarts: 2 } }, bonusText: '+2 Smarts', items: [['palette', '🎨', 'Palette'], ['masks', '🎭', 'Theatre'], ['frame', '🖼️', 'Masterpiece'], ['camera', '📷', 'Camera'], ['clapper', '🎬', 'Film'], ['statue', '🗿', 'Statue']] },
  { id: 'lucky', n: 'Lucky Charms', bonus: { luck: 0.15 }, bonusText: 'More rare pickups', items: [['clover', '🍀', 'Four-leaf clover'], ['dice', '🎲', 'Lucky dice'], ['ball', '🔮', 'Crystal ball'], ['eye', '🧿', 'Evil eye'], ['shooting', '🌠', 'Shooting star'], ['unicorn', '🦄', 'Unicorn']] },
  { id: 'gadgets', n: 'Gadget Geek', bonus: { income: 0.1 }, bonusText: 'Businesses earn 10% more', items: [['phone', '📱', 'Phone'], ['laptop', '💻', 'Laptop'], ['gamepad', '🎮', 'Gamepad'], ['joystick', '🕹️', 'Joystick'], ['radio', '📻', 'Radio'], ['battery', '🔋', 'Battery']] },
  { id: 'heights', n: 'High Points', bonus: { stats: { fit: 1, cred: 1 } }, bonusText: '+1 Fitness, +1 Street cred', items: [['hilltop', '⛰️', 'Hilltop'], ['telescope', '🔭', 'Telescope'], ['sunrise', '🌄', 'Sunrise view'], ['cablecar', '🚡', 'Cable car'], ['paraglider', '🪂', 'Paraglider'], ['eagle', '🦅', 'Eagle']] },
  { id: 'legends', n: 'City Legends', rare: true, bonus: { stats: { cred: 3, charm: 1 } }, bonusText: '+3 Street cred, +1 Charm', items: [['crown', '👑', 'Crown'], ['trophy', '🏆', 'Trophy'], ['diamond', '💎', 'Diamond'], ['rocket', '🚀', 'Rocket'], ['hero', '🦸', 'Hero'], ['liberty', '🗽', 'Landmark']] },
];

// People. look: see CFTWorld.person. at: where they hang out. likes: gift item ids they love.
D.CAST = {
  max: { n: 'Cousin Max', e: '🧔', role: 'Your cousin, a laid-back musician', look: { skin: 0xe9b98f, hair: 0x6b4423, shirt: 0x6d8b3a, pants: 0x5b4636, beard: true, hat: 0xf2b134 }, likes: ['records', 'guitar', 'burger'] },
  rosa: { n: 'Nonna Rosa', e: '👵', role: 'The heart of the neighbourhood', look: { skin: 0xf1c9a5, hair: 0xd9d4cc, shirt: 0x9b2c4f, pants: 0x5b4636, dress: true, glasses: true, apron: 0xf4f1ea, h: 0.9 }, likes: ['cannoli', 'bouquet', 'orchid'] },
  kim: { n: 'Coach Kim', e: '🏃‍♀️', role: 'Personal trainer who never stops', look: { skin: 0xd39d6c, hair: 0x1d1d1d, shirt: 0xff6b4a, pants: 0x1f2937, long: true, hat: 0xff6b4a }, likes: ['protein', 'apple'] },
  okafor: { n: 'Professor Okafor', e: '👨‍🏫', role: 'Librarian, professor, walking encyclopedia', look: { skin: 0x6b4126, hair: 0x8a8a8a, shirt: 0x7b52c7, pants: 0x24324a, glasses: true, beard: true }, likes: ['novel', 'textbook', 'chocolates'] },
  priya: { n: 'Priya Shah', e: '👩‍💼', role: 'Banker and business mentor', look: { skin: 0xb57b4a, hair: 0x1d1d1d, shirt: 0x1f2937, pants: 0x1f2937, long: true, glasses: true, bag: 0x9b2c4f }, likes: ['orchid', 'watch', 'chocolates'] },
  dmitri: { n: 'Dmitri "Wrench"', e: '🧑‍🔧', role: 'Mechanic who can fix anything', look: { skin: 0xf1c9a5, hair: 0xb98545, shirt: 0x2b6cb0, pants: 0x2b6cb0, beard: true }, likes: ['toolkit', 'burger', 'energydrink'] },
  luna: { n: 'Luna Ortiz', e: '🧑‍🎨', role: 'Street artist with big plans', look: { skin: 0xd39d6c, hair: 0xef6aa5, shirt: 0x14b8a6, pants: 0x1f2937, long: true, bag: 0xf2b134 }, likes: ['spraycan', 'art', 'records'] },
  kai: { n: 'Kai', e: '🛹', role: 'Skater, never without a board', look: { skin: 0xe9b98f, hair: 0xe1c06a, shirt: 0xf2b134, pants: 0x24324a, hat: 0xe8453c }, likes: ['comic', 'energydrink', 'fries'] },
  jay: { n: 'Jay', e: '🎮', role: 'Gamer, coder, snack enthusiast', look: { skin: 0x8d5a33, hair: 0x1d1d1d, shirt: 0x7b52c7, pants: 0x1f2937, glasses: true, bag: 0x3aa6b9 }, likes: ['comic', 'console', 'fries'] },
  noor: { n: 'Noor', e: '📸', role: 'Photographer chasing the perfect light', look: { skin: 0xd39d6c, hair: 0x2b1a10, shirt: 0xf4f1ea, pants: 0x6b7280, long: true, bag: 0x1f2937 }, likes: ['camera', 'souvenir', 'latte'] },
  benny: { n: 'Benny', e: '🍜', role: 'Food blogger with a bottomless stomach', look: { skin: 0xf6d7c0, hair: 0x3a2618, shirt: 0xff8a3d, pants: 0x5b4636, h: 1.05 }, likes: ['cake', 'cannoli', 'sundae'] },
  zoe: { n: 'Zoe', e: '🎧', role: 'DJ who hears music everywhere', look: { skin: 0x6b4126, hair: 0x7b52c7, shirt: 0x1f2937, pants: 0xef6aa5, long: true, glasses: true }, likes: ['records', 'headphones', 'mocktail'] },
  ollie: { n: 'Ollie', e: '🐶', role: 'Animal shelter volunteer', look: { skin: 0xf1c9a5, hair: 0xb24a2a, shirt: 0x84cc16, pants: 0x5b4636 }, likes: ['treats', 'plushie', 'cookie'] },
  sam: { n: 'Sam', e: '🌷', role: 'Works at the flower shop', look: { skin: 0xe9b98f, hair: 0x6b4423, shirt: 0xef6aa5, pants: 0x24324a, long: true }, lookB: { skin: 0xe9b98f, hair: 0x6b4423, shirt: 0x3aa6b9, pants: 0x24324a }, likes: ['bouquet', 'orchid', 'necklace', 'chocolates'] },
  tomas: { n: 'Chef Tomás', e: '🧑‍🍳', role: 'Chef with a famous temper and a bigger heart', look: { skin: 0xd39d6c, hair: 0x1d1d1d, shirt: 0xf4f1ea, pants: 0x1f2937, hat: 0xffffff, beard: true }, likes: ['groceries', 'cake'] },
  bouchard: { n: 'Officer Bouchard', e: '👮', role: 'Neighbourhood cop, mostly helps lost tourists', look: { skin: 0xf1c9a5, hair: 0x6b4423, shirt: 0x24324a, pants: 0x24324a, hat: 0x24324a }, likes: ['donut', 'coffee'] },
  chad: { n: 'Chad Moneybags', e: '🤑', role: 'Developer who wants to bulldoze the park', look: { skin: 0xf6d7c0, hair: 0xe1c06a, shirt: 0x1f2937, pants: 0x1f2937, glasses: true, bag: 0x5b4636 }, likes: [] },
  tourist: { n: 'Lost Tourist', e: '🧳', role: 'Visiting from far away', look: { skin: 0xf6d7c0, hair: 0xb24a2a, shirt: 0xf2b134, pants: 0xc2b59b, hat: 0xf4f1ea, bag: 0x2b6cb0 }, likes: [] },
  grandpa: { n: 'Grandpa Walt', e: '👴', role: 'Retired mailman, slow walker, great stories', look: { skin: 0xf1c9a5, hair: 0xd9d4cc, shirt: 0x6b7280, pants: 0x5b4636, hat: 0x5b4636, glasses: true, h: 0.92 }, likes: ['letter'] },
  busker: { n: 'Mo the Busker', e: '🎺', role: 'Plays trumpet on the corner', look: { skin: 0x8d5a33, hair: 0x1d1d1d, shirt: 0xe8453c, pants: 0x1f2937, hat: 0x1f2937 }, likes: [] },
  thief: { n: 'Sneaky Pete', e: '🦹', role: 'Petty thief', look: { skin: 0xe9b98f, hair: 0x1d1d1d, shirt: 0x111111, pants: 0x111111, hat: 0x111111 }, likes: [] },
  lostkid: { n: 'Lost kid', e: '🧒', role: 'Separated from their parents', look: { skin: 0xd39d6c, hair: 0x2b1a10, shirt: 0xf2b134, pants: 0x2b6cb0, h: 0.6 }, likes: [] },
  mayor: { n: 'Mayor Tremblay', e: '🎗️', role: 'The mayor', look: { skin: 0xf1c9a5, hair: 0x8a8a8a, shirt: 0x1f2937, pants: 0x1f2937, glasses: true }, likes: [] },
  meatball: { n: 'Meatball the cat', e: '🐈', role: "Nonna Rosa's runaway cat", animal: 'cat', color: 0xff9a3d, likes: [] },
  rex: { n: 'Rex', e: '🐕', role: 'A very good dog', animal: 'dog', color: 0xc8894a, likes: [] },
  biscuit: { n: 'Biscuit', e: '🐶', role: 'A shelter pup', animal: 'dog', color: 0xf0e6d6, likes: [] },
};
D.FRIENDS = ['bouchard', 'max', 'kai', 'jay', 'noor', 'benny', 'zoe', 'ollie', 'luna', 'dmitri', 'kim', 'okafor', 'priya', 'tomas', 'rosa'];
D.FRIEND_PERKS = {
  max: 'Rent is 20% cheaper', kai: 'Rides 5% faster', jay: '+1 phone radar range', noor: 'Photos pay $25', benny: 'Food gives 20% more energy',
  zoe: 'Dance-offs are easier', ollie: 'Pets make you happier', luna: 'Tagging needs no spray can 1 time in 3', dmitri: 'Vehicles 10% cheaper',
  bouchard: 'Metro rides are free', kim: '+10 max energy', okafor: '+10% XP', priya: 'Businesses earn 10% more', tomas: 'Restaurants earn 15% more', rosa: 'Bakery and café food is free',
};
D.KID_NAMES = ['Mia', 'Leo', 'Zara', 'Theo', 'Luna', 'Nico', 'Ava', 'Milo', 'Ivy', 'Felix', 'Rosie', 'Kai', 'Noa', 'Eli'];

D.CHAPTERS = [
  { id: 1, n: 'New in Town', e: '🧳', blurb: 'Cousin Max lends you his couch. Learn the streets and meet the neighbours.' },
  { id: 2, n: 'The Hustle', e: '💸', blurb: 'Odd jobs, a lemonade stand and a room of your own.' },
  { id: 3, n: 'Wheels', e: '🛵', blurb: 'From skateboard to scooter. The city gets smaller.' },
  { id: 4, n: 'The Crew', e: '🤝', blurb: 'Gamers, photographers, foodies and DJs. Find your people.' },
  { id: 5, n: 'Love', e: '💘', blurb: 'Someone at the flower shop keeps smiling at you.' },
  { id: 6, n: 'Turf', e: '🎨', blurb: 'Luna has a plan to win the blocks back from the crews, one mural at a time.' },
  { id: 7, n: 'Boss Mode', e: '🏪', blurb: 'Service businesses, food trucks and restaurants. Priya says: think bigger.' },
  { id: 8, n: 'Family', e: '👶', blurb: 'Rings, a wedding, a crib and tiny shoes.' },
  { id: 9, n: 'The Big Leagues', e: '🌆', blurb: 'Chad Moneybags wants to bulldoze the park. Not on your watch.' },
  { id: 10, n: 'Around the Block', e: '🗺️', blurb: 'Side stories from everyone in the neighbourhood.' },
];

// ------------------------------------------------------------------------------------------------ missions
// M(id, chapter, title, giver, where the giver stands, requirements, intro lines, steps, outro lines, reward)
// requirements: {m: [mission ids], lvl, apt, partner, married, kids, friends, turf, biz, own: item, stat: {}}
// steps (do): go | talk | collect | deliver | buy | have | stat | level | own | pay | escort | chase | race | photo |
//   visit | dance | quiz | sleep | walk | chat | tag | defend | rush | count (key, n, abs: a counter, see the wacky update below)
D.MISSIONS = [];
function M(id, ch, title, giver, at, req, intro, steps, outro, reward, extra) {
  D.MISSIONS.push(Object.assign({ id, ch, title, giver, at, req: req || {}, intro, steps, outro, reward }, extra || {}));
}
const QUIZ = {
  road: [['A light turns yellow. You...', ['Speed up!', 'Get ready to stop', 'Honk'], 1], ['Who goes first at a crosswalk?', ['Pedestrians', 'Whoever is fastest', 'Pigeons'], 0], ['Helmet on a scooter is...', ['Optional fashion', 'A must', 'For tourists'], 1], ['Parking in a bike lane is...', ['Fine for a minute', 'Rude and not allowed', 'A sport'], 1]],
  trivia: [['How many legs does a spider have?', ['6', '8', '10'], 1], ['Which planet is called the red planet?', ['Mars', 'Venus', 'Jupiter'], 0], ['What do bees make?', ['Milk', 'Honey', 'Butter'], 1], ['How many minutes in a day?', ['1440', '1200', '960'], 0], ['Water freezes at...', ['0 °C', '10 °C', '-10 °C'], 0], ['The largest ocean is the...', ['Atlantic', 'Pacific', 'Arctic'], 1]],
  smart: [['What is 15% of 200?', ['20', '30', '35'], 1], ['Who painted the Mona Lisa?', ['Da Vinci', 'Picasso', 'Monet'], 0], ['The chemical symbol for gold is...', ['Go', 'Au', 'Gd'], 1], ['A haiku has how many lines?', ['3', '5', '7'], 0], ['Light travels faster than sound.', ['True', 'False', 'Only on Tuesdays'], 0], ['What is the square root of 144?', ['11', '12', '14'], 1]],
  biz: [['Revenue minus costs is...', ['Profit', 'Turnover', 'Vibes'], 0], ['A good first step for a business is...', ['A plan', 'A yacht', 'A nap'], 0], ['If a coffee costs $2 to make and sells for $5, you earn...', ['$3', '$7', '$2'], 0], ['Happy customers usually...', ['Come back', 'Disappear', 'Complain more'], 0]],
  coffee: [['An espresso with steamed milk and foam is a...', ['Cappuccino', 'Americano', 'Affogato'], 0], ['Coffee beans are actually...', ['Seeds', 'Nuts', 'Beans'], 0], ['Which country grows the most coffee?', ['Brazil', 'Canada', 'Iceland'], 0], ['Decaf has...', ['No caffeine at all', 'A little caffeine', 'Double caffeine'], 1]],
  posh: [['A gentleman always...', ['Holds the door', 'Cuts the line', 'Wears socks with sandals'], 0], ['What fork do you use first?', ['The outermost one', 'The biggest', 'Your hands'], 0], ['Polo is played on...', ['Horses', 'Bicycles', 'Ice'], 0], ['Tea time is traditionally at...', ['4 pm', '9 am', 'Midnight'], 0]],
  civic: [['Who runs a city council meeting?', ['The mayor', 'A pigeon', 'Nobody'], 0], ['Parks are good for...', ['Everyone', 'Only dogs', 'Parking lots'], 0], ['A petition needs...', ['Signatures', 'Glitter', 'A dragon'], 0], ['Public libraries are...', ['Free for everyone', 'Members only', 'Haunted'], 0]],
};

// ---- Chapter 1: New in Town
M('c1-couch', 1, 'Welcome to the Couch', 'max', 'home', {}, [
  'Cuz! You made it! Welcome to the big city. My couch is your couch. Literally, that is the only furniture.',
  'First lesson: this neighbourhood is full of loose change. People drop it everywhere. Go grab 5 coins and get a feel for the streets.',
  "Follow the gold arrow over your head. It always points to what you're looking for.",
], [{ do: 'collect', what: 'coin', n: 5, text: 'Collect 5 coins 🪙' }],
['See? The city pays you just for walking around. Keep your eyes open: books, roses, dumbbells... it all makes you better at something.'], { money: 20, xp: 30 });
M('c1-coffee', 1, 'Fuel Up', 'max', 'home', { m: ['c1-couch'] }, [
  "You look tired. Running around takes energy, see that ⚡ bar? When it's empty you can't sprint.",
  'Go to {place} and grab a coffee. Tell them Max sent you. Actually, maybe don\'t, I owe them money.',
], [{ do: 'go', to: 'cafe', text: 'Get a coffee at {place}', get: { energy: 40 }, say: ['You grab a coffee. The barista smiles. ⚡ +40 energy!'] }],
['Coffee, coins and curiosity. That\'s how you survive here. Oh, and you should meet Nonna Rosa. Everyone needs to meet Nonna Rosa.'], { xp: 40, money: 10 });
M('c1-rosa', 1, 'The Nonna of the Block', 'max', 'home', { m: ['c1-coffee'] }, [
  'Nonna Rosa knows everybody, feeds everybody and judges everybody. If she likes you, this whole neighbourhood likes you.',
  "She's usually at {place}. Go say hi. Be polite. Eat whatever she gives you.",
], [{ do: 'talk', who: 'rosa', at: 'bakery', text: 'Find Nonna Rosa near {place}', say: [
  'Rosa: Eh! You must be Max\'s cousin. Same nose. Too skinny! Here, eat a cannoli.',
  'Rosa: You need anything in this neighbourhood, you come to me. And you help me sometimes, yes? That\'s how it works here.'] }],
['Rosa: Good. Now go, go, I have bread in the oven.'], { xp: 50, items: { cannoli: 1 }, rel: { rosa: 15 } });
M('c1-bread', 1, 'Bread Run', 'rosa', 'bakery', { m: ['c1-rosa'] }, [
  'Mrs. Lefebvre ordered bread and her knees are not what they used to be. Take this warm loaf to her door.',
  'The address is on the bag. Don\'t eat it on the way. I will know.',
], [{ do: 'deliver', item: 'bread', to: 'addr', n: 1, text: 'Deliver the bread to {place}' }],
['Rosa: She called me already. She said you have nice manners. Here, something for your trouble.'], { money: 25, xp: 50, rel: { rosa: 10 } });
M('c1-phone', 1, 'Get Connected', 'max', 'home', { m: ['c1-coffee'] }, [
  "Dude. Is that a flip phone? We need to fix that. A smartphone shows nearby shops on your map and has a radar for goodies.",
  'Grab one at a tech shop. About $60. You\'ve been collecting coins, right?',
], [{ do: 'buy', item: 'phone2', text: 'Buy a smartphone 📱 at a tech shop' }],
['Welcome to the 21st century, cuz. Press P (or tap 📱) any time to open your phone.'], { xp: 60, stats: { smarts: 0.5 } });
M('c1-stretch', 1, 'Stretch Your Legs', 'kim', 'park', { m: ['c1-couch'] }, [
  "You! New face! I'm Coach Kim. You walk like a sleepy penguin. Let's fix that.",
  'Hit 3 checkpoints before the clock runs out. Hold Shift to sprint. GO GO GO!',
], [{ do: 'race', n: 3, time: 75, text: 'Race through 3 checkpoints' }],
["Not bad, penguin! Come back and I'll make an athlete out of you."], { xp: 60, money: 15, stats: { fit: 1 }, rel: { kim: 10 } });
M('c1-library', 1, 'Card Carrying', 'okafor', 'library', { m: ['c1-couch'] }, [
  'Ah, a new reader! I am Professor Okafor. Knowledge, my friend, is the only thing nobody can take from you.',
  'Books get left on benches all over this city. Bring me back 3 of them and I\'ll give you a library card.',
], [{ do: 'collect', what: 'book', n: 3, text: 'Find 3 books 📚 around the neighbourhood' }],
['Splendid! Every book you pick up makes you a little smarter. Smarts make businesses earn more, you know.'], { xp: 60, stats: { smarts: 1 }, rel: { okafor: 10 } });
M('c1-snap', 1, 'Tourist in Your Own Town', 'max', 'home', { m: ['c1-rosa'] }, [
  "Mom wants proof I'm showing you around. Go take a selfie somewhere nice. A park, a monument, whatever.",
  'Press E when you get there to snap a photo.',
], [{ do: 'photo', of: 'park', text: 'Take a selfie at a park 📸' }],
['Perfect, she\'ll love it. You look like an actual local now.'], { xp: 50, stats: { style: 0.5 }, happy: 3 });
M('c1-sleep', 1, 'First Night', 'max', 'home', { m: ['c1-bread', 'c1-phone'] }, [
  "Long day, huh? Couch is all yours. Sleeping fills your energy all the way back up.",
  'Head home and press E to sleep. Tomorrow we find you some real work.',
], [{ do: 'sleep', text: 'Sleep at home 😴' }],
["Morning, sunshine! New day, new hustle. Rosa's looking for you, by the way."], { xp: 80, money: 20 });

// ---- Chapter 2: The Hustle
M('c2-flyers', 2, 'Flyer Frenzy', 'rosa', 'bakery', { m: ['c1-sleep'] }, [
  "We're having a block party for the bakery's anniversary! I need these flyers in 3 mailboxes.",
  'Quick quick, before the ink smudges.',
], [{ do: 'deliver', item: 'flyers', to: 'addr', n: 3, text: 'Drop flyers at 3 addresses ({n} left)' }],
['Rosa: Wonderful! Everybody will come. Everybody always comes for my cannoli.'], { money: 40, xp: 80, rel: { rosa: 10 } });
M('c2-meatball', 2, "Where's Meatball?", 'rosa', 'bakery', { m: ['c2-flyers'] }, [
  'Disaster! Meatball, my cat, ran out the door! He is orange and round and very, very fast for a meatball.',
  "Someone saw him near {place}. Catch him before he gets to the fish market!",
], [{ do: 'chase', who: 'meatball', at: 'park', time: 70, speed: 6, text: 'Catch Meatball the cat 🐈' }],
['Rosa: My baby! You naughty meatball! Thank you, thank you. Take this, I insist.'], { money: 60, xp: 100, rel: { rosa: 15 }, stats: { fit: 0.5 } });
M('c2-groceries', 2, "Nonna's Groceries", 'rosa', 'bakery', { m: ['c2-flyers'] }, [
  'My Sunday sauce needs tomatoes, and my legs need a break. Go to {place} and get my groceries. They\'re already paid for.',
], [{ do: 'go', to: 'grocery', text: 'Pick up groceries at {place}', say: ['The cashier hands you a heavy bag. "For Rosa? Tell her hi!"'] },
  { do: 'go', to: 'giver', text: 'Bring the groceries to Rosa' }],
['Rosa: Grazie! Come Sunday, there will be a plate for you.'], { money: 35, xp: 70, rel: { rosa: 10 }, items: { sauce: 1 } });
M('c2-priya', 2, 'Money Talks', 'rosa', 'bakery', { m: ['c2-flyers'] }, [
  "You want to really make money? Talk to my friend Priya at {place}. She's a banker, but a nice one.",
], [{ do: 'talk', who: 'priya', at: 'bank', text: 'Meet Priya at {place}', say: [
  "Priya: Rosa sent you? Then you're already more trustworthy than half my clients.",
  'Priya: Here\'s the secret: make money while you sleep. Start a business. Even a tiny one. Even... a lemonade stand.'] }],
['Priya: Come back when you\'re ready to be your own boss.'], { xp: 60, rel: { priya: 10 } });
M('c2-lemons', 2, 'When Life Gives You Lemons', 'priya', 'bank', { m: ['c2-priya'] }, [
  'A lemonade stand costs about $60. It earns a little every hour, even when you\'re busy. Open your phone, go to Business, and buy one.',
  'Tip: visit your business to collect the cash in the till.',
], [{ do: 'own', what: 'bizid', id: 'lemonade', text: 'Open a lemonade stand 🍋 (phone → Business)' }],
['Priya: Congratulations, CEO! Visit your stand to collect earnings, or hire a manager later to do it for you.'], { xp: 120, stats: { smarts: 1 }, rel: { priya: 10 } });
M('c2-squeeze', 2, 'Squeeze the Day', 'priya', 'bank', { m: ['c2-lemons'] }, [
  'Your lemonade needs lemons. The fruit truck dropped a crate and lemons rolled everywhere. Collect 6!',
], [{ do: 'collect', what: 'lemon', n: 6, near: 'here', text: 'Collect 6 runaway lemons 🍋' }],
['Priya: Fresh lemons, fresh profits. Your stand will love this.'], { money: 50, xp: 90 });
M('c2-profit', 2, 'First Profit', 'priya', 'bank', { m: ['c2-lemons'] }, [
  "Let's see if you can save. Get $200 in your pocket. Coins, jobs, lemonade. Whatever works.",
  'Psst: your phone has an Odd Jobs app with quick paid gigs.',
], [{ do: 'have', money: 200, text: 'Have $200 💵' }],
["Priya: A saver! Now you can afford your own place. Don't tell Max I said so."], { xp: 120, rel: { priya: 10 } });
M('c2-room', 2, 'A Room of One\'s Own', 'max', 'home', { m: ['c2-profit'] }, [
  "Cuz, I love you, but the couch has a you-shaped dent now. Time to find your own place.",
  'Open your phone, tap Homes, and rent the basement studio. Movers will find you a spot nearby.',
], [{ do: 'own', what: 'apt', n: 1, text: 'Rent your own place (phone → Homes)' }],
["Max: Look at you, a tenant! I'll miss you. Mostly I'll miss you doing the dishes."], { xp: 150, happy: 10, rel: { max: 10 } });
M('c2-warming', 2, 'Housewarming', 'max', 'home', { m: ['c2-room'] }, [
  'Empty apartments are sad apartments. Get a plant, at least. Furniture makes you happier every day you live there.',
], [{ do: 'buy', item: 'plant_home', text: 'Buy a big houseplant 🪴 at a furniture shop' }, { do: 'go', to: 'home', text: 'Bring it home' }],
['Max: Now THAT is a home. Happiness up! Happy people earn more, you know. Science.'], { xp: 100, happy: 5 });
M('c2-walkies', 2, 'Walkies!', 'rosa', 'bakery', { m: ['c2-flyers'] }, [
  'My friend Ollie at the animal shelter is short on dog walkers. Go see him at {place}.',
], [{ do: 'talk', who: 'ollie', at: 'pet', text: 'Meet Ollie at {place}', say: ['Ollie: A volunteer! This is Rex. Rex loves the park. Rex loves everyone. Walk him to the park?'] },
  { do: 'escort', who: 'rex', to: 'park', text: 'Walk Rex to the park 🐕' }],
['Ollie: Look at that tail go! You\'re a natural.'], { money: 40, xp: 100, rel: { ollie: 15 }, happy: 4 });
M('c2-dogbiz', 2, 'Dog Walking Empire', 'ollie', 'pet', { m: ['c2-walkies', 'c2-lemons'] }, [
  'People keep asking me for dog walkers. You should start a dog walking service! It pays better than lemonade.',
], [{ do: 'own', what: 'bizid', id: 'dogwalk', text: 'Start a dog walking service 🐕 (phone → Business)' }],
['Ollie: Hah! Every dog in the neighbourhood is about to love you.'], { xp: 150, rel: { ollie: 15 } });

// ---- Chapter 3: Wheels
M('c3-kai', 3, 'Board Meeting', 'kai', 'park', { m: ['c1-sleep'] }, [
  "Yo! I'm Kai. Walking everywhere? That's a lot of walking, dude. Get a board. Board is life.",
  'Bike and board shops sell them. About $120.',
], [{ do: 'buy', item: 'skateboard', text: 'Buy a skateboard 🛹' }],
['Kai: Sick! Press V (or tap the ride button) to hop on and off. Shift to push harder.'], { xp: 100, stats: { cred: 1 }, rel: { kai: 10 } });
M('c3-ollie', 3, 'Ollie Ollie', 'kai', 'park', { m: ['c3-kai'] }, [
  "Let's see what you got. 5 checkpoints, 80 seconds. On the board, obviously.",
], [{ do: 'race', n: 5, time: 80, ride: 'any', text: 'Race 5 checkpoints' }],
['Kai: Radical! You\'re a natural, bro. Or you\'re just lucky. Either way, respect.'], { money: 50, xp: 140, stats: { cred: 1 }, rel: { kai: 15 } });
M('c3-bike', 3, 'Two Wheels Good', 'dmitri', 'bike', { m: ['c3-kai'] }, [
  "Name's Dmitri. They call me Wrench. If it has wheels, I can fix it.",
  'A bicycle is faster than a board on long trips. Buy one, and come back when you want something with an engine.',
], [{ do: 'buy', item: 'bicycle', text: 'Buy a bicycle 🚲' }],
['Dmitri: Good choice. Pump your tires, oil your chain, and watch for car doors.'], { xp: 120, rel: { dmitri: 10 } });
M('c3-courier', 3, 'Bike Courier', 'dmitri', 'bike', { m: ['c3-bike'] }, [
  'I have two packages that need to go out right now and my courier has a flat. You up for it? The clock is ticking.',
], [{ do: 'deliver', item: 'package', to: 'addr', n: 2, time: 240, text: 'Deliver 2 packages before time runs out' }],
['Dmitri: On time! You\'re hired. Well, you\'re not hired. But you\'re appreciated.'], { money: 90, xp: 150, rel: { dmitri: 10 }, stats: { fit: 0.5 } });
M('c3-license', 3, "Learner's Permit", 'dmitri', 'garage', { m: ['c3-courier'] }, [
  'Want a scooter? You need a licence. I can quiz you right here. Get them right.',
], [{ do: 'quiz', at: 'giver', qs: QUIZ.road, need: 3, text: 'Pass the road rules quiz' }],
['Dmitri: You passed! Buy your scooter licence at a school, then the scooter at a garage. Vroom vroom.'], { xp: 150, stats: { smarts: 0.5 } });
M('c3-scooter', 3, 'Vroom Vroom', 'dmitri', 'garage', { m: ['c3-license'] }, [
  'Licence first ($120 at a school), then the scooter ($2,400 at a garage). On a scooter, A and D steer and W is gas.',
], [{ do: 'buy', item: 'license_moped', text: 'Get a scooter licence 🪪 at a school' }, { do: 'buy', item: 'moped', text: 'Buy a scooter 🛵 at a garage' }],
['Dmitri: Look at you go! Helmet on, smile on.'], { xp: 250, stats: { cred: 2, style: 1 } });
M('c3-scenic', 3, 'The Scenic Route', 'kai', 'park', { m: ['c3-ollie'] }, [
  'My cousin wants to see this city. Can you send me pics? The tallest building around, and somewhere with water.',
], [{ do: 'photo', of: 'tall', text: 'Photograph the tallest building nearby 🏙️' }, { do: 'photo', of: 'water', text: 'Photograph some water 🌊' }],
['Kai: These are fire! My cousin says this city looks awesome.'], { money: 60, xp: 150, rel: { kai: 15 } });

// ---- Chapter 4: The Crew
M('c4-jay', 4, 'Player Two', 'max', 'home', { m: ['c1-sleep'] }, [
  'My buddy Jay lost his retro game cartridges all over the neighbourhood. Long story. Involves a hole in a backpack.',
  'He hangs out at {place}. Go help him and you\'ll have a friend for life.',
], [{ do: 'talk', who: 'jay', at: 'tech', text: 'Meet Jay at {place}', say: ['Jay: Max sent you? Legend. My cartridges! 4 of them, out there somewhere. Please. Please please.'] },
  { do: 'collect', what: 'cart', n: 4, near: 'here', text: 'Find Jay\'s 4 game cartridges 👾' }, { do: 'go', to: 'who', who: 'jay', text: 'Bring them back to Jay' }],
['Jay: You found them ALL? Achievement unlocked: best friend. Seriously, let\'s hang out sometime.'], { xp: 160, rel: { jay: 50 }, friend: 'jay' });
M('c4-speedrun', 4, 'Speedrun Any%', 'jay', 'tech', { m: ['c4-jay'] }, [
  'Real-life speedrun. 6 checkpoints, 90 seconds, any vehicle. I\'ll time it. Frame perfect, please.',
], [{ do: 'race', n: 6, time: 90, ride: 'any', text: 'Speedrun 6 checkpoints' }],
['Jay: New world record! Okay, it\'s the first record. But still!'], { money: 80, xp: 180, rel: { jay: 10 }, stats: { fit: 0.5 } });
M('c4-noor', 4, 'Golden Hour', 'max', 'home', { m: ['c1-snap'] }, [
  'Noor is a photographer friend of mine. She needs an assistant for golden hour shots. She\'s at {place}.',
], [{ do: 'talk', who: 'noor', at: 'museum', text: 'Meet Noor at {place}', say: ['Noor: Golden hour is the hour before sunset. Everything glows. Take a photo of a park between 17:00 and 20:00 for me.'] },
  { do: 'photo', of: 'park', when: [17, 20], text: 'Photograph a park at golden hour (17:00–20:00) 🌅' }],
['Noor: Look at that light! You have an eye, friend.'], { money: 70, xp: 170, rel: { noor: 50 }, friend: 'noor', stats: { style: 1 } });
M('c4-benny', 4, 'Taste Test', 'rosa', 'bakery', { m: ['c2-groceries'] }, [
  'There\'s a food blogger, Benny, who says my cannoli is "fine". FINE! Go find him at {place} and set him straight.',
], [{ do: 'talk', who: 'benny', at: 'restaurant', text: 'Find Benny at {place}', say: ['Benny: Rosa\'s cannoli is, like, a 9 out of 10. Prove the city has better! Let\'s do a food tour: a bakery, an ice cream shop and a café.'] },
  { do: 'visit', kinds: ['bakery', 'icecream', 'cafe'], text: 'Food tour: visit a bakery, ice cream shop and café' }],
['Benny: Okay, you have TASTE. Rosa still wins, don\'t tell her I said that. Friends?'], { money: 50, xp: 170, rel: { benny: 50 }, friend: 'benny', energy: 40 });
M('c4-recipe', 4, 'Secret Recipe', 'benny', 'restaurant', { m: ['c4-benny'] }, [
  "I'm cooking for my blog and need fresh basil. People grow it in window boxes and it blows away. Find 4 bunches!",
], [{ do: 'collect', what: 'herb', n: 4, near: 'here', text: 'Find 4 bunches of fresh basil 🌿' }, { do: 'go', to: 'giver', text: 'Bring them to Benny' }],
['Benny: The pesto is going to be legendary. You get the first bite.'], { money: 60, xp: 150, rel: { benny: 10 }, energy: 30 });
M('c4-zoe', 4, 'Drop the Beat', 'max', 'home', { m: ['c4-jay'] }, [
  "Zoe is the best DJ in town and she's my band's biggest fan. Probably our only fan. She hangs at {place}. Show her your moves.",
], [{ do: 'talk', who: 'zoe', at: 'lounge', text: 'Find Zoe at {place}', say: ['Zoe: Max\'s cousin? Can you dance? Let\'s find out.'] },
  { do: 'dance', at: 'giver', n: 10, text: 'Dance-off with Zoe 💃' }],
['Zoe: Okay you can MOVE. You\'re officially cool. Friends?'], { xp: 170, rel: { zoe: 50 }, friend: 'zoe', stats: { charm: 1 } });
M('c4-vinyl', 4, 'Vinyl Hunt', 'zoe', 'lounge', { m: ['c4-zoe'] }, [
  'A collector dumped five rare records around the neighbourhood as a treasure hunt. I NEED them for my set tonight.',
], [{ do: 'collect', what: 'vinyl', n: 5, near: 'here', text: 'Find 5 rare records 💿' }],
['Zoe: Tonight\'s set is going to be historic. You\'re on the guest list forever.'], { money: 100, xp: 200, rel: { zoe: 15 }, stats: { style: 1 } });
M('c4-kai', 4, 'Skate or Die', 'kai', 'park', { m: ['c3-scenic'] }, [
  'Okay, you\'ve proven you\'re cool. Hang out with me for a bit? Take me to grab some fries.',
], [{ do: 'escort', who: 'kai', to: 'fastfood', text: 'Hang out with Kai: get fries 🍟' }],
['Kai: Best fries ever, dude. We\'re friends now. That\'s the rule.'], { xp: 140, rel: { kai: 30 }, friend: 'kai', happy: 4 });
M('c4-crew', 4, 'Squad Goals', 'max', 'home', { m: ['c4-jay'] }, [
  "You've been making friends! Friends follow you around if you invite them, and each one has a perk. Get to 3 friends.",
], [{ do: 'own', what: 'friends', n: 3, text: 'Have 3 friends 🤝' }],
['Max: My little cousin, all grown up and popular. I\'m so proud.'], { xp: 250, happy: 10, money: 100 });

// ---- Chapter 5: Love
M('c5-meet', 5, 'Petals and Puns', 'rosa', 'bakery', { m: ['c2-room'] }, [
  'Rosa: Tell me something, {name}. You are single, yes? Too busy for love? Nobody is too busy for love.',
  'Rosa: There is a lovely person at {place}. Sam. Very kind. Very cute. Go buy a flower or something.',
], [{ do: 'talk', who: 'sam', at: 'flowers', text: 'Visit Sam at {place}', say: ['Sam: Hi! Welcome to the shop. Looking for anything in particular?'],
  ask: { q: 'What do you say?', opts: [
    ['"I was looking for a flower... and then I saw you."', { charm: 2 }, 'Sam laughs. "Okay, that was cheesy. But it worked."', true],
    ['"What\'s your favourite flower?"', null, 'Sam lights up. "Tulips! They keep growing after you cut them. Stubborn, like me." You talk for twenty minutes.', true],
    ['"Do you sell cactus?"', null, 'Sam squints. "...Yes?" It is a little awkward. Maybe try again.', false]] } }],
['Sam: Come back sometime? The shop gets boring without customers who talk to me.'], { xp: 150, rel: { sam: 20 }, stats: { charm: 0.5 } }, { pref: true });
M('c5-roses', 5, 'A Rose by Any Other Name', 'sam', 'flowers', { m: ['c5-meet'] }, [
  'Sam: The wind knocked over our rose delivery and they\'re all over the block. Could you help me find 5? I\'ll owe you a coffee.',
], [{ do: 'collect', what: 'rose', n: 5, text: 'Find 5 roses 🌹' }, { do: 'go', to: 'giver', text: 'Bring them to Sam' }],
['Sam: My hero! About that coffee... tomorrow?'], { xp: 160, rel: { sam: 15 }, stats: { charm: 1 } });
M('c5-coffee', 5, 'Coffee Date', 'sam', 'flowers', { m: ['c5-roses'] }, [
  'Sam: So... that coffee? Walk with me to {place}?',
], [{ do: 'escort', who: 'sam', to: 'cafe', text: 'Walk Sam to {place} ☕' },
  { do: 'talk', who: 'sam', at: 'here', text: 'Chat with Sam', say: ['Sam: So what brought you to the city?'], ask: { q: 'You answer:', opts: [
    ['"I wanted a fresh start. And I found more than I expected."', { charm: 3 }, 'Sam blushes into {his} latte.', true],
    ['"My cousin\'s couch, mostly."', null, 'Sam laughs so hard {he} snorts. "Max\'s couch? Legendary."', true],
    ['Talk about your coin collection for 40 minutes', null, 'Sam\'s eyes glaze over a little. Maybe not that.', false]] } }],
['Sam: This was really nice. Let\'s do it again.'], { xp: 180, rel: { sam: 20 }, happy: 5 });
M('c5-glowup', 5, 'Glow Up', 'max', 'home', { m: ['c5-coffee'] }, [
  "Cuz, you're going on DATES now. You can't wear that. Get something nice, get a haircut, get your Style up to 5.",
], [{ do: 'stat', stat: 'style', n: 5, text: 'Reach Style 5 🕶️ (clothes, haircuts, shades)' }],
['Max: Who IS this stylish person? I barely recognize you.'], { xp: 160, rel: { max: 5 } });
M('c5-dinner', 5, 'Dinner for Two', 'sam', 'flowers', { m: ['c5-coffee', 'c5-glowup'] }, [
  'Sam: There\'s this place, {place}. I\'ve always wanted to go. Dinner? My treat next time.',
], [{ do: 'escort', who: 'sam', to: 'restaurant', text: 'Take Sam to dinner at {place} 🍝' }, { do: 'pay', money: 60, at: 'here', text: 'Pay for dinner ($60)' }],
['Sam: That was perfect. You\'re kind of perfect. Don\'t let it go to your head.'], { xp: 220, rel: { sam: 20 }, happy: 8, energy: 50 });
M('c5-sunset', 5, 'Sunset Walk', 'sam', 'flowers', { m: ['c5-dinner'] }, [
  'Sam: Let\'s watch the sunset somewhere pretty. Somewhere with water, or a park. Between 18:00 and 21:00.',
], [{ do: 'escort', who: 'sam', to: 'water', when: [18, 21], text: 'Watch the sunset with Sam by the water (18:00–21:00) 🌅' }],
['Sam: I don\'t want this day to end.'], { xp: 220, rel: { sam: 20 }, happy: 10 });
M('c5-ask', 5, 'The Question', 'max', 'home', { m: ['c5-sunset'] }, [
  "So? Are you two official or what? Go ask! Charm 6 recommended. Bring flowers. Seriously, bring flowers.",
], [{ do: 'buy', item: 'bouquet', text: 'Buy a bouquet 💐' }, { do: 'talk', who: 'sam', at: 'flowers', text: 'Ask Sam to be your {pt}', say: ['Sam: Flowers? For the florist? That\'s either very sweet or very funny.'],
  ask: { q: 'Ask:', opts: [['"Will you be my {pt}?"', { charm: 6 }, 'Sam smiles the biggest smile. "Yes. Obviously yes."', true], ['Chicken out and talk about the weather', null, 'Nice weather, sure. Sam looks a little disappointed.', false]] } }],
['Sam: My {pt}... I mean, I\'m YOUR {pt}. You know what I mean.'], { xp: 400, rel: { sam: 30 }, partner: 'sam', happy: 20, items: { bouquet: -1 } });
M('c5-movein', 5, 'Moving In', 'sam', 'flowers', { m: ['c5-ask'] }, [
  'Sam: My lease is ending... What if we got a place together? It would need to be at least a one-bedroom.',
], [{ do: 'own', what: 'apt', n: 2, text: 'Get a one-bedroom or better (phone → Homes)' }, { do: 'go', to: 'home', text: 'Welcome Sam home' }],
['Sam: Home. Our home. I\'m putting a plant in every corner.'], { xp: 300, happy: 15, rel: { sam: 15 } });

// ---- Chapter 6: Turf
M('c6-luna', 6, 'Wall Flower', 'max', 'home', { m: ['c2-room'] }, [
  "My friend Luna paints murals. She says crews are taking over the blocks and covering everything in ugly posters.",
  'Find her at {place}. She could use help.',
], [{ do: 'talk', who: 'luna', at: 'museum', text: 'Meet Luna at {place}', say: [
  'Luna: Every block around here belongs to a crew. Pigeon Mafia, Skate Rats, Bingo Grannies, you name it. Their posters are everywhere.',
  'Luna: We cover their posters with art. Tag all 4 spots in a block, then beat their boss, and the block is yours. Grab a spray can 🎨 first.'] },
  { do: 'tag', n: 1, text: 'Tag a crew poster in any block (needs a spray can 🎨)' }],
['Luna: Beautiful! That\'s how it starts. One wall at a time.'], { xp: 160, rel: { luna: 20 }, stats: { cred: 1 }, items: { spray: 3 } });
M('c6-block', 6, 'Block Party', 'luna', 'museum', { m: ['c6-luna'] }, [
  'Your home block first. Tag all 4 spots and beat the crew boss. Check the Turf app on your phone to see who runs it.',
], [{ do: 'own', what: 'turf', n: 1, text: 'Take over your first block 🏳️' }],
['Luna: Your first block! It pays you every hour now, and the posters have your colours. Party at your place?'], { xp: 300, stats: { cred: 2 }, rel: { luna: 20 }, money: 100 });
M('c6-cans', 6, 'Spray It Loud', 'luna', 'museum', { m: ['c6-luna'] }, [
  'We need supplies. Find 6 spray cans around the neighbourhood. Hardware and gift shops sell them too.',
], [{ do: 'collect', what: 'spray', n: 6, text: 'Collect 6 spray cans 🎨' }],
['Luna: Now we\'re armed. With colour.'], { xp: 160, money: 50, stats: { cred: 1 } });
M('c6-three', 6, 'Expansion Pack', 'luna', 'museum', { m: ['c6-block'] }, [
  'One block is a start. Three blocks is a movement. Bosses further away are tougher, so build up your street cred.',
], [{ do: 'own', what: 'turf', n: 3, text: 'Own 3 blocks' }],
['Luna: Three! People are starting to talk about us.'], { xp: 400, stats: { cred: 3 }, money: 250 });
M('c6-defend', 6, 'Hold the Line', 'luna', 'museum', { m: ['c6-three'] }, [
  'Bad news. A crew is sneaking back and tagging over our murals. When it happens your phone will buzz. Clean it up fast or lose the block!',
], [{ do: 'defend', text: 'Defend a block: clean the rival tag 🧽' }],
['Luna: That\'s the spirit. They\'ll think twice now.'], { xp: 300, stats: { cred: 2 }, money: 150 });
M('c6-six', 6, 'Neighbourhood Hero', 'luna', 'museum', { m: ['c6-three'] }, [
  'Six blocks. Then they can\'t ignore us. The murals will cover half the map!',
], [{ do: 'own', what: 'turf', n: 6, text: 'Own 6 blocks' }],
['Luna: Six! The news did a story about the murals. They called us "the colour crew".'], { xp: 700, stats: { cred: 4 }, money: 600, rel: { luna: 20 }, friend: 'luna' });
M('c6-king', 6, 'Ruler of the Streets', 'luna', 'museum', { m: ['c6-six'] }, [
  'Ten blocks and Street cred 20. Then nobody will ever cover our art again.',
], [{ do: 'own', what: 'turf', n: 10, text: 'Own 10 blocks' }, { do: 'stat', stat: 'cred', n: 20, text: 'Reach Street cred 20 🔥' }],
['Luna: You did it. The whole neighbourhood is a gallery now. Thank you, {name}.'], { xp: 1500, money: 3000, stats: { cred: 5, style: 2 } });

// ---- Chapter 7: Boss Mode
M('c7-plan', 7, 'Business Plan', 'priya', 'bank', { m: ['c2-dogbiz'] }, [
  'Two small businesses! Ready for real ones? Every serious business starts with a plan, Smarts 6 and $1,000 saved.',
], [{ do: 'stat', stat: 'smarts', n: 6, text: 'Reach Smarts 6 🧠 (books, classes, the library)' }, { do: 'have', money: 1000, text: 'Save $1,000' },
  { do: 'quiz', at: 'giver', qs: QUIZ.biz, need: 3, text: 'Pitch your plan to Priya' }],
['Priya: Approved! I\'d invest in you. Actually, I just did. Here\'s a little start-up money.'], { xp: 400, money: 500, rel: { priya: 20 }, friend: 'priya' });
M('c7-bikes', 7, 'Spokes & Folks', 'dmitri', 'bike', { m: ['c7-plan'] }, [
  'I\'m retiring from bike repairs to focus on cars. Want to run a bike repair shop? You know the business now.',
], [{ do: 'own', what: 'bizid', id: 'bikeshop', text: 'Open a bike repair shop 🔧' }],
['Dmitri: In good hands. Remember: lefty loosey, righty tighty.'], { xp: 400, rel: { dmitri: 20 }, friend: 'dmitri' });
M('c7-rush', 7, 'Rush Hour', 'priya', 'bank', { m: ['c7-plan'] }, [
  'Businesses get rush hours. Visit one of yours and start a rush: deliver orders to real addresses before time runs out. Tips are huge.',
], [{ do: 'rush', n: 3, text: 'Complete 3 rush-hour deliveries' }],
['Priya: Your customers love you. That\'s worth more than any ad.'], { xp: 350, money: 200 });
M('c7-laundry', 7, 'Clean Money', 'priya', 'bank', { m: ['c7-plan'] }, [
  'Laundromats are boring. Boring is wonderful. Steady income, no drama. Buy one.',
], [{ do: 'own', what: 'bizid', id: 'laundromat', text: 'Open a laundromat 🧺' }],
['Priya: Steady wins the race. And the rent.'], { xp: 450, stats: { smarts: 1 } });
M('c7-tomas', 7, 'Yes, Chef!', 'benny', 'restaurant', { m: ['c4-benny', 'c7-plan'] }, [
  'Benny: The best chef in the city, Chef Tomás, needs a hand. He\'s scary but brilliant. He\'s at {place}.',
], [{ do: 'talk', who: 'tomas', at: 'restaurant', text: 'Meet Chef Tomás at {place}', say: ['Tomás: You are the helper? Bah. Fine. I need bread, groceries and coffee for my staff. VITE!'] },
  { do: 'visit', kinds: ['bakery', 'grocery', 'cafe'], time: 300, text: 'Fetch bread, groceries and coffee in 5 minutes' }, { do: 'go', to: 'who', who: 'tomas', text: 'Rush back to Chef Tomás' }],
['Tomás: ...Not terrible. Come back. I teach you something.'], { xp: 400, money: 150, rel: { tomas: 30 } });
M('c7-truck', 7, "Taco 'Bout It", 'tomas', 'restaurant', { m: ['c7-tomas'] }, [
  'Tomás: You want to cook? Start small. A food truck. Low rent, big flavour. Buy one.',
], [{ do: 'own', what: 'bizid', id: 'foodtruck', text: 'Buy a taco truck 🌮' }],
['Tomás: Good. Now don\'t burn the tortillas.'], { xp: 500, rel: { tomas: 15 } });
M('c7-manager', 7, 'Delegation', 'priya', 'bank', { m: ['c7-bikes'] }, [
  'You can\'t be everywhere. Hire a manager in one of your businesses: they collect the till for you and keep earning while you\'re away.',
], [{ do: 'own', what: 'managers', n: 1, text: 'Hire a manager (phone → Business)' }],
['Priya: Now you\'re thinking like a tycoon.'], { xp: 400, stats: { smarts: 1 } });
M('c7-upgrade', 7, 'Level Up the Shop', 'priya', 'bank', { m: ['c7-manager'] }, [
  'Upgrades multiply income. Buy 3 upgrades across your businesses.',
], [{ do: 'own', what: 'upgrades', n: 3, text: 'Buy 3 business upgrades' }],
['Priya: Compound growth, my favourite words.'], { xp: 500, money: 400 });
M('c7-pizza', 7, "That's Amore", 'rosa', 'bakery', { m: ['c7-truck'] }, [
  'Rosa: Tomás says you can cook. My late husband always wanted a pizzeria. Open one. Use my sauce. Make him proud.',
], [{ do: 'own', what: 'bizid', id: 'pizzeria', text: 'Open a pizzeria 🍕' }, { do: 'rush', n: 2, text: 'Deliver 2 rush orders' }],
['Rosa: Mamma mia, it smells like home. Grazie, {name}.'], { xp: 900, rel: { rosa: 20 }, friend: 'rosa', happy: 10 });
M('c7-tycoon', 7, 'Tycoon Material', 'priya', 'bank', { m: ['c7-pizza'] }, [
  'Five businesses. That\'s an empire. Go build it.',
], [{ do: 'own', what: 'biz', n: 5, text: 'Own 5 businesses' }],
['Priya: I knew it the day Rosa sent you. You\'re a natural.'], { xp: 1200, money: 2000, stats: { smarts: 2 } });
M('c7-diploma', 7, 'Back to School', 'okafor', 'library', { m: ['c7-plan'] }, [
  'Okafor: A business owner should never stop learning. Take an evening class at a school. Or three. Reach Smarts 12.',
], [{ do: 'stat', stat: 'smarts', n: 12, text: 'Reach Smarts 12 🧠' }],
['Okafor: Splendid. Your businesses will feel it.'], { xp: 600, rel: { okafor: 20 }, friend: 'okafor' });

// ---- Chapter 8: Family
M('c8-ring', 8, 'Put a Ring On It', 'max', 'home', { m: ['c5-movein'], partner: true }, [
  "Cuz. You and Sam. It's obvious. Get a ring. Jewellers have them. They are not cheap. Love is not cheap. Actually love is free but rings are not.",
], [{ do: 'buy', item: 'ring', text: 'Buy an engagement ring 💍 ($2,500)' }],
['Max: Oh my gosh. Oh my GOSH. When are you asking?'], { xp: 300, rel: { max: 10 } });
M('c8-propose', 8, 'The Big Question', 'max', 'home', { m: ['c8-ring'] }, [
  'Max: Take Sam somewhere beautiful at night, between 20:00 and 23:00. By the water, maybe. Then ask.',
], [{ do: 'escort', who: 'sam', to: 'water', when: [20, 23], text: 'Take Sam somewhere beautiful at night (20:00–23:00)' },
  { do: 'talk', who: 'sam', at: 'here', text: 'Propose to Sam 💍', say: ['Sam: Why are you looking at me like that? Why are you kneeling?!'],
    ask: { q: 'The moment:', opts: [['"Sam, will you marry me?"', { charm: 8 }, 'Sam cries, laughs, and says YES about nine times.', true], ['Lose your nerve', null, 'You pretend to tie your shoe. Sam knows. Try again!', false]] } }],
['Sam: Engaged! I have to call everyone. EVERYONE.'], { xp: 800, happy: 20, rel: { sam: 20 }, engaged: true, items: { ring: -1 } });
M('c8-plan', 8, 'Wedding Planner', 'rosa', 'bakery', { m: ['c8-propose'] }, [
  'Rosa: A wedding! Leave the cake to me. You: flowers, nice clothes and the deposit for the hall. $1,500. Go go go!',
], [{ do: 'visit', kinds: ['flowers', 'clothes', 'bakery'], text: 'Wedding errands: florist, clothes shop, bakery' }, { do: 'pay', money: 1500, at: 'community', text: 'Pay the hall deposit at {place} ($1,500)' }],
['Rosa: Everything is ready. I already cried twice.'], { xp: 500, rel: { rosa: 15 } });
M('c8-wedding', 8, 'I Do!', 'sam', 'flowers', { m: ['c8-plan'] }, [
  'Sam: Today\'s the day! Meet me at {place}. Everybody is there. Don\'t be late. Don\'t be early. Be exactly on time.',
], [{ do: 'escort', who: 'sam', to: 'park', text: 'Walk Sam down the aisle in the park 💒' }, { do: 'dance', at: 'here', n: 8, text: 'First dance!' }],
['Everyone: 🎉 CONGRATULATIONS! 🎉', 'Max: I\'m not crying, YOU\'RE crying.'], { xp: 1500, happy: 30, married: true, money: 1000, rel: { sam: 25 } });
M('c8-nest', 8, 'Room to Grow', 'sam', 'flowers', { m: ['c8-wedding'] }, [
  'Sam: So... I\'ve been thinking about a family. We\'d need a two-bedroom at least. And a crib.',
], [{ do: 'own', what: 'apt', n: 3, text: 'Get a two-bedroom or better' }, { do: 'buy', item: 'crib', text: 'Buy a crib 🍼' }],
['Sam: It\'s perfect. Tiny socks are next.'], { xp: 600, happy: 10 });
M('c8-baby', 8, 'Welcome to the World', 'sam', 'flowers', { m: ['c8-nest'] }, [
  'Sam: It\'s time! IT\'S TIME! Get to {place}! NOW!',
], [{ do: 'escort', who: 'sam', to: 'clinic', text: 'Rush Sam to {place} 🏥' }],
['A tiny voice fills the room. Welcome to the family, little one. 👶'], { xp: 2000, happy: 30, kid: true });
M('c8-stroll', 8, 'Stroller Derby', 'sam', 'home', { m: ['c8-baby'] }, [
  'Sam: The baby only sleeps when we\'re moving. Take them for a long walk, 1 km on foot. Bring the family along.',
], [{ do: 'walk', m: 1000, text: 'Walk 1 km on foot with the family' }],
['Sam: Out like a light. You\'re a natural parent.'], { xp: 500, happy: 10, stats: { fit: 1 } });
M('c8-school', 8, 'First Day of School', 'sam', 'home', { m: ['c8-stroll'], lvl: 14 }, [
  'Sam: Can you believe it? {kid} starts school today! Walk them to {place}.',
], [{ do: 'escort', who: 'kid', to: 'school', text: 'Walk {kid} to school 🎒' }],
['{kid}: Bye! Love you! Don\'t embarrass me!'], { xp: 600, happy: 12 });
M('c8-teddy', 8, 'Lost: Mr. Snuggles', 'sam', 'home', { m: ['c8-school'] }, [
  '{kid} lost Mr. Snuggles the teddy bear on the way home and won\'t stop crying. Search the neighbourhood!',
], [{ do: 'collect', what: 'teddy', n: 1, near: 'here', far: true, text: 'Find Mr. Snuggles 🧸' }, { do: 'go', to: 'home', text: 'Bring Mr. Snuggles home' }],
['{kid}: MR. SNUGGLES! You saved him! You\'re the best!'], { xp: 500, happy: 15 });
M('c8-wagon', 8, 'Family Wagon', 'dmitri', 'garage', { m: ['c8-baby'] }, [
  'Dmitri: A family needs a real car. Get your driver\'s licence (level 12) and a family SUV. I\'ll give it a once-over.',
], [{ do: 'buy', item: 'license_car', text: "Get a driver's licence 🪪 at a school" }, { do: 'buy', item: 'suv', text: 'Buy a family SUV 🚙' }],
['Dmitri: Runs like a dream. Buckle the little one in.'], { xp: 900, stats: { cred: 1 } });
M('c8-picnic', 8, 'Family Picnic', 'sam', 'home', { m: ['c8-stroll'] }, [
  'Sam: Picnic day! Get a picnic basket at a grocery store, then take the whole family to a park.',
], [{ do: 'buy', item: 'picnic', text: 'Buy a picnic basket 🧺' }, { do: 'go', to: 'park', family: true, text: 'Picnic at {place} with the family' }],
['Sam: Sun, sandwiches and the people I love. Perfect day.'], { xp: 600, happy: 20, items: { picnic: -1 } });
M('c8-second', 8, 'Double Trouble', 'sam', 'home', { m: ['c8-teddy'] }, [
  'Sam: Sooo... what do you think about baby number two? We\'d need a bigger place, a loft or better.',
], [{ do: 'own', what: 'apt', n: 4, text: 'Move to a loft or better' }, { do: 'escort', who: 'sam', to: 'clinic', text: 'Get Sam to {place}!' }],
['Two kids! Twice the love, half the sleep. 👶👶'], { xp: 2500, happy: 25, kid: true });
M('c8-dog', 8, 'Every Family Needs a Dog', 'ollie', 'pet', { m: ['c8-baby'] }, [
  'Ollie: A family without a dog? Biscuit at the shelter has been waiting for someone like you. Adopt?',
], [{ do: 'buy', item: 'dog', text: 'Adopt a dog 🐕 at a pet shop' }],
['Ollie: Biscuit picked you, I think. Look at that wiggle.'], { xp: 500, happy: 15, rel: { ollie: 20 }, friend: 'ollie' });

// ---- Chapter 9: The Big Leagues
M('c9-chad', 9, 'The Suit', 'rosa', 'bakery', { m: ['c6-block', 'c7-pizza'] }, [
  'Rosa: Some man in a suit is telling everyone he will tear down our park and build a parking tower. Chad something. Go talk to him!',
], [{ do: 'talk', who: 'chad', at: 'hotel', text: 'Confront Chad Moneybags at {place}', say: [
  'Chad: Chad Moneybags. Of Moneybags Developments. You\'re the lemonade kid, right? Adorable.',
  'Chad: That park is a waste of space. Parking tower. Forty floors. Nobody can stop me. Unless the whole city signs a petition. Ha! As if.'] }],
['Rosa: A petition, eh? Then we get signatures.'], { xp: 400 });
M('c9-petition', 9, 'Sign Here, Please', 'rosa', 'bakery', { m: ['c9-chad'] }, [
  'Rosa: Talk to people on the street. Press E next to anyone walking by. Get 10 signatures!',
], [{ do: 'chat', n: 10, text: 'Get 10 signatures from people on the street ✍️' }],
['Rosa: Ten! And they all said "save the park" before you even asked.'], { xp: 600, stats: { charm: 2 }, rel: { rosa: 10 } });
M('c9-dirt', 9, 'Dirt on Chad', 'bouchard', 'community', { m: ['c9-petition'] }, [
  'Officer Bouchard: Between us, Chad cuts corners. Photograph his building sites: the tallest tower around, a hotel and a landmark he wants to "redevelop".',
], [{ do: 'photo', of: 'tall', text: 'Photograph the tallest building 📸' }, { do: 'photo', of: 'hotel', text: 'Photograph a hotel 📸' }, { do: 'photo', of: 'landmark', text: 'Photograph a landmark 📸' }],
['Bouchard: That\'s enough evidence for the council meeting. Nice work.'], { xp: 600, rel: { bouchard: 20 } });
M('c9-race', 9, 'Drag Race', 'chad', 'hotel', { m: ['c9-dirt'] }, [
  'Chad: Think you can beat me? My sports car versus whatever you drive. 7 checkpoints, 100 seconds. In a car.',
], [{ do: 'race', n: 7, time: 100, ride: 'drive', text: 'Out-race Chad: 7 checkpoints in a car or on a scooter' }],
['Chad: What?! My car is... my car is in the shop. That\'s why. Ugh.'], { xp: 900, stats: { cred: 3 }, money: 1500 });
M('c9-council', 9, 'Town Hall', 'mayor', 'community', { m: ['c9-dirt'] }, [
  'Mayor Tremblay: The council will hear you. Answer our questions well.',
], [{ do: 'quiz', at: 'giver', qs: QUIZ.civic, need: 3, text: 'Speak at the council meeting' }],
['Mayor: A compelling case. The final vote is at the Charity Gala.'], { xp: 800, stats: { smarts: 2, charm: 1 } });
M('c9-gala', 9, 'Charity Gala', 'mayor', 'community', { m: ['c9-council'] }, [
  'Mayor: The gala is black tie. Style 15 and a donation of $10,000 for the park fund, and the council is yours.',
], [{ do: 'stat', stat: 'style', n: 15, text: 'Reach Style 15 🕶️' }, { do: 'pay', money: 10000, at: 'hotel', text: 'Donate $10,000 at the gala ({place})' }, { do: 'dance', at: 'here', n: 12, text: 'Dance the night away' }],
['Mayor: The park is safe. The city thanks you.'], { xp: 2500, happy: 20, stats: { charm: 3 } });
M('c9-final', 9, 'Best Block in Town', 'rosa', 'bakery', { m: ['c9-gala'] }, [
  'Rosa: Chad has one last trick: the "Best Block" contest. The winner decides the park\'s future. We need 8 blocks, 3 businesses and a happy you.',
], [{ do: 'own', what: 'turf', n: 8, text: 'Own 8 blocks' }, { do: 'own', what: 'biz', n: 3, text: 'Own 3 businesses' }, { do: 'stat', stat: 'happy', n: 70, text: 'Be happy (70%+) 😊' },
  { do: 'talk', who: 'chad', at: 'hotel', text: 'Face Chad Moneybags', say: ['Chad: You... you actually won. The whole neighbourhood voted for you.', 'Chad: Fine. The park stays. Maybe... maybe I\'ll build a playground instead. Don\'t tell anyone I\'m nice.'] }],
['Rosa: You did it. You really did it. This neighbourhood is yours, {name}. It always was.', 'The Mayor hands you the 🗝️ Key to the City!'], { xp: 5000, money: 25000, happy: 30, items: { key_city: 1 }, stats: { cred: 5, charm: 3 } });
M('c9-penthouse', 9, 'Top of the World', 'priya', 'bank', { m: ['c7-tycoon'] }, [
  'Priya: You can afford it now. The penthouse at the top of the tallest building around. Go on.',
], [{ do: 'own', what: 'apt', n: 6, text: 'Buy the penthouse 🌇' }],
['Priya: Enjoy the view, tycoon.'], { xp: 5000, happy: 20 });
M('c9-supercar', 9, 'Need for Speed', 'dmitri', 'garage', { m: ['c9-race'] }, [
  'Dmitri: You beat Chad in THAT? Imagine you in a real sports car.',
], [{ do: 'buy', item: 'sports', text: 'Buy a sports car 🏎️' }],
['Dmitri: Zero to sixty in "oh my goodness". Drive safe.'], { xp: 3000, stats: { cred: 3, style: 3 } });
M('c9-legend', 9, 'Living Legend', 'max', 'home', { m: ['c9-final', 'c9-penthouse'] }, [
  'Max: Remember when you slept on my couch? Now you own half the block. Reach level 35 and you\'re a city legend.',
], [{ do: 'level', n: 35, text: 'Reach level 35 ⭐' }],
['Max: My cousin, the legend. Want your old couch back? For old times\' sake?'], { xp: 10000, happy: 25, money: 50000 });

// ---- Chapter 10: Around the Block (side stories)
const S = (id, title, giver, at, req, intro, steps, outro, reward) => M(id, 10, title, giver, at, req, intro, steps, outro, reward);
S('s-rosa-basil', 'Basil Emergency', 'rosa', 'bakery', { m: ['c2-groceries'] }, ['Rosa: No basil, no sauce! The window boxes on this street have the best basil. Find 3 bunches!'],
  [{ do: 'collect', what: 'herb', n: 3, near: 'here', text: 'Find 3 bunches of basil 🌿' }, { do: 'go', to: 'giver', text: 'Bring them to Rosa' }], ['Rosa: Now THAT is basil.'], { money: 45, xp: 120, rel: { rosa: 8 } });
S('s-rosa-bingo', 'Bingo Night', 'rosa', 'bakery', { m: ['c2-meatball'] }, ['Rosa: Bingo night! Walk me to {place}? My hip says no but my heart says B-12.'],
  [{ do: 'escort', who: 'rosa', to: 'community', speed: 3, text: 'Walk Rosa to bingo at {place} (she\'s slow!)' }], ['Rosa: I can feel it. Tonight I win the toaster.'], { money: 50, xp: 140, rel: { rosa: 12 } });
S('s-rosa-gossip', 'Gossip Run', 'rosa', 'bakery', { m: ['c2-flyers'] }, ['Rosa: Three of my friends need to hear the news. Which news? None of your business. Deliver these notes.'],
  [{ do: 'deliver', item: 'letter', to: 'addr', n: 3, text: 'Deliver 3 notes ({n} left)' }], ['Rosa: Perfect. Now the whole street will know by dinner.'], { money: 55, xp: 130, rel: { rosa: 8 } });
S('s-rosa-sauce', 'Sunday Sauce', 'rosa', 'bakery', { m: ['s-rosa-basil'] }, ['Rosa: Bring a jar of my Sunday sauce to Chef Tomás at {place}. He pretends he doesn\'t like it.'],
  [{ do: 'deliver', item: 'sauce', to: 'restaurant', n: 1, text: 'Deliver the sauce to {place}' }], ['Tomás (later): ...It is very good. Do not tell her.'], { money: 40, xp: 120, rel: { rosa: 6, tomas: 6 } });
S('s-kim-5k', 'Couch to 5K', 'kim', 'park', { m: ['c1-stretch'] }, ['Kim: Step one of being an athlete: move! Walk or run 2 km on your own two feet.'],
  [{ do: 'walk', m: 2000, text: 'Move 2 km on foot 👟' }], ['Kim: Look at those legs! Fitness up!'], { xp: 160, stats: { fit: 1.5 }, rel: { kim: 10 } });
S('s-kim-iron', 'Iron Will', 'kim', 'park', { m: ['c1-stretch'] }, ['Kim: Someone left dumbbells all over the neighbourhood. Bring back 5, that\'s a workout in itself.'],
  [{ do: 'collect', what: 'dumbbell', n: 5, text: 'Collect 5 dumbbells 🏋️' }], ['Kim: Strong! Come work out at a gym any time.'], { xp: 150, stats: { fit: 1 }, money: 30 });
S('s-kim-intervals', 'Sprint Intervals', 'kim', 'park', { m: ['s-kim-5k'] }, ['Kim: Intervals! 6 checkpoints, 70 seconds, on foot. No wheels!'],
  [{ do: 'race', n: 6, time: 70, ride: 'foot', text: 'Sprint 6 checkpoints on foot' }], ['Kim: Champion lungs!'], { xp: 220, stats: { fit: 2 }, rel: { kim: 15 } });
S('s-kim-marathon', 'Marathon Mindset', 'kim', 'park', { m: ['s-kim-intervals'] }, ['Kim: The big one. 5 km on foot. Take water breaks. Coffee counts as water. It does not, but fine.'],
  [{ do: 'walk', m: 5000, text: 'Move 5 km on foot 🏃' }], ['Kim: You\'re an athlete now. Officially. Want to be friends?'], { xp: 500, stats: { fit: 3 }, rel: { kim: 30 }, friend: 'kim' });
S('s-kim-gym', 'Gym Rat', 'kim', 'park', { m: ['s-kim-iron'] }, ['Kim: Reach Fitness 8. Gyms help. So do dumbbells, running and a good night\'s sleep.'],
  [{ do: 'stat', stat: 'fit', n: 8, text: 'Reach Fitness 8 💪' }], ['Kim: Your speed is way up. Feel it?'], { xp: 300, money: 80 });
S('s-prof-quiz', 'Pop Quiz', 'okafor', 'library', { m: ['c1-library'] }, ['Okafor: A little quiz, for fun. For fun! Do not panic.'],
  [{ do: 'quiz', at: 'giver', qs: QUIZ.trivia, need: 3, text: 'Answer the professor\'s quiz' }], ['Okafor: Excellent mind!'], { xp: 150, stats: { smarts: 1 }, rel: { okafor: 10 } });
S('s-prof-overdue', 'Overdue', 'okafor', 'library', { m: ['c1-library'] }, ['Okafor: Three books are overdue. Very overdue. Please return these reminders to the borrowers. Politely.'],
  [{ do: 'deliver', item: 'overdue', to: 'addr', n: 3, text: 'Deliver 3 overdue notices ({n} left)' }], ['Okafor: The books are back! Libraries run on trust and gentle reminders.'], { money: 50, xp: 140, rel: { okafor: 8 } });
S('s-prof-field', 'Field Trip', 'okafor', 'library', { m: ['s-prof-quiz'] }, ['Okafor: Learning happens outside too. Photograph a museum and a landmark for my class.'],
  [{ do: 'photo', of: 'museum', text: 'Photograph a museum or gallery 📸' }, { do: 'photo', of: 'landmark', text: 'Photograph a landmark 📸' }], ['Okafor: The students loved them.'], { xp: 200, stats: { smarts: 1 }, money: 40 });
S('s-prof-final', 'Final Exam', 'okafor', 'library', { m: ['s-prof-field'], stat: { smarts: 8 } }, ['Okafor: The final exam. Hard questions. Do your best.'],
  [{ do: 'quiz', at: 'giver', qs: QUIZ.smart, need: 4, text: 'Pass the final exam' }], ['Okafor: Top marks! I\'m proud to call you a friend.'], { xp: 500, stats: { smarts: 3 }, rel: { okafor: 30 }, friend: 'okafor' });
S('s-cop-purse', 'Purse Snatcher', 'bouchard', 'community', { m: ['c1-sleep'] }, ['Officer Bouchard: A thief just grabbed a purse near {place}! I\'m too slow. You\'re fast. Go!'],
  [{ do: 'chase', who: 'thief', at: 'here', time: 60, speed: 7, text: 'Catch the purse snatcher 🦹' }], ['Bouchard: Caught! The lady wants to give you a reward.'], { money: 80, xp: 180, stats: { cred: 1 }, rel: { bouchard: 15 } });
S('s-cop-lostkid', 'Lost Kid', 'bouchard', 'community', { m: ['s-cop-purse'] }, ['Bouchard: This little one lost their parents at the park. They\'re waiting at {place}. Walk the kid there?'],
  [{ do: 'escort', who: 'lostkid', to: 'park', speed: 4, text: 'Walk the lost kid to their parents at {place}' }], ['Bouchard: Happy tears all round. Good work.'], { money: 50, xp: 160, happy: 8, rel: { bouchard: 10 } });
S('s-cop-bike', 'Bike Thief', 'bouchard', 'community', { m: ['s-cop-purse', 'c3-bike'] }, ['Bouchard: Someone\'s riding off with a stolen bike. Faster than the last one. Use wheels!'],
  [{ do: 'chase', who: 'thief', at: 'here', time: 75, speed: 9.5, text: 'Catch the bike thief 🚲' }], ['Bouchard: The bike is back with its owner. You\'re a local hero.'], { money: 120, xp: 250, stats: { cred: 1 }, rel: { bouchard: 15 } });
S('s-cop-stakeout', 'Stakeout', 'bouchard', 'community', { m: ['s-cop-bike'] }, ['Bouchard: Graffiti vandals hit {place} at night. Stake it out between 22:00 and 2:00 and photograph them.'],
  [{ do: 'photo', of: 'spot', when: [22, 2], text: 'Stake out the spot and take a photo (22:00–2:00) 🌙' }], ['Bouchard: Caught on camera. Turns out it was raccoons. Very artistic raccoons.'], { money: 150, xp: 300, rel: { bouchard: 15 }, friend: 'bouchard' });
S('s-cop-keys', 'The Mayor\'s Keys', 'bouchard', 'community', { m: ['s-cop-stakeout'] }, ['Bouchard: Don\'t laugh. The mayor lost the keys to City Hall. Somewhere around here. Please find them before anyone finds out.'],
  [{ do: 'collect', what: 'key', n: 1, near: 'here', far: true, text: 'Find the lost keys 🔑' }], ['Bouchard: Phew. This never happened.'], { money: 200, xp: 300 });
S('s-noor-pigeon', 'Pigeon Portraits', 'noor', 'museum', { m: ['c4-noor'] }, ['Noor: I\'m doing a series called "Pigeons of the City". Get me a park shot, pigeons optional but encouraged.'],
  [{ do: 'photo', of: 'park', text: 'Photograph a park 🐦' }], ['Noor: Stunning. That pigeon has range.'], { money: 60, xp: 140, rel: { noor: 10 } });
S('s-noor-night', 'Night Lights', 'noor', 'museum', { m: ['c4-noor'] }, ['Noor: The city at night is magic. Photograph the tallest building between 21:00 and 5:00.'],
  [{ do: 'photo', of: 'tall', when: [21, 5], text: 'Photograph the tallest building at night 🌃' }], ['Noor: Every window a little story.'], { money: 90, xp: 200, rel: { noor: 10 }, stats: { style: 1 } });
S('s-noor-water', 'Reflections', 'noor', 'museum', { m: ['s-noor-pigeon'] }, ['Noor: Water makes everything twice as pretty. Find me some.'],
  [{ do: 'photo', of: 'water', text: 'Photograph water 🌊' }], ['Noor: This one goes on my wall.'], { money: 80, xp: 180, rel: { noor: 10 } });
S('s-noor-tour', 'Photo Marathon', 'noor', 'museum', { m: ['s-noor-water'] }, ['Noor: Photo marathon! A café, a cinema and a hotel, as fast as you can.'],
  [{ do: 'photo', of: 'cafe', text: 'Photograph a café ☕' }, { do: 'photo', of: 'cinema', text: 'Photograph a cinema or theatre 🎬' }, { do: 'photo', of: 'hotel', text: 'Photograph a hotel 🏨' }], ['Noor: Exhibition material. I\'m naming one after you.'], { money: 150, xp: 300, stats: { style: 1 } });
S('s-benny-donut', 'Donut Dash', 'benny', 'restaurant', { m: ['c4-benny'] }, ['Benny: Donuts are best fresh. Hit a bakery and then a café in 3 minutes. GO.'],
  [{ do: 'visit', kinds: ['bakery', 'cafe'], time: 180, text: 'Bakery then café in 3 minutes' }], ['Benny: Still warm! You\'re a legend.'], { money: 50, xp: 150, energy: 40, rel: { benny: 8 } });
S('s-benny-critic', 'Food Critic', 'benny', 'restaurant', { m: ['c4-recipe'] }, ['Benny: Help me review four places: a restaurant, fast food, an ice cream shop and a bakery.'],
  [{ do: 'visit', kinds: ['restaurant', 'fastfood', 'icecream', 'bakery'], text: 'Review 4 food spots' }], ['Benny: My readers say you have a great palate.'], { money: 100, xp: 250, rel: { benny: 10 }, energy: 60 });
S('s-benny-poutine', 'Poutine Pilgrimage', 'benny', 'restaurant', { m: ['s-benny-critic'] }, ['Benny: Every city has a dish. Find a fast food place and get me something legendary.'],
  [{ do: 'buy', item: 'poutine', text: 'Eat a poutine 🍛 at a fast food place' }], ['Benny: Cheese curds. Gravy. Joy.'], { money: 40, xp: 140, happy: 5 });
S('s-zoe-opener', 'Opening Act', 'zoe', 'lounge', { m: ['c4-vinyl'] }, ['Zoe: My opening dancer bailed. You\'re up. Harder routine this time.'],
  [{ do: 'dance', at: 'giver', n: 14, speed: 1.3, text: 'Open Zoe\'s show 🕺' }], ['Zoe: The crowd went WILD.'], { money: 150, xp: 250, stats: { charm: 1, style: 1 }, rel: { zoe: 10 } });
S('s-zoe-flyers', 'Gig Flyers', 'zoe', 'lounge', { m: ['c4-zoe'] }, ['Zoe: Spread the word: 4 flyers for my show to 4 doors.'],
  [{ do: 'deliver', item: 'flyers', to: 'addr', n: 4, text: 'Drop 4 gig flyers ({n} left)' }], ['Zoe: Sold out! Thanks to you.'], { money: 80, xp: 180, rel: { zoe: 8 } });
S('s-zoe-melody', 'The Lost Melody', 'zoe', 'lounge', { m: ['s-zoe-opener'] }, ['Zoe: I heard a melody in a dream and it scattered all over the city. Weird, I know. Find 5 notes 🎵.'],
  [{ do: 'collect', what: 'note', n: 5, near: 'here', text: 'Collect 5 lost notes 🎵' }], ['Zoe: That\'s it! That\'s the song! It\'s about you, kind of.'], { money: 120, xp: 260, stats: { charm: 1 } });
S('s-ollie-fetch', 'Fetch!', 'ollie', 'pet', { m: ['c2-walkies'] }, ['Ollie: Rex threw his tennis balls everywhere. Can dogs throw? Apparently. Find 4.'],
  [{ do: 'collect', what: 'ball', n: 4, near: 'here', text: 'Find 4 tennis balls 🎾' }], ['Ollie: Rex says thank you. In dog.'], { money: 40, xp: 140, rel: { ollie: 10 } });
S('s-ollie-escape', 'The Great Escape', 'ollie', 'pet', { m: ['s-ollie-fetch'] }, ['Ollie: Biscuit slipped the leash! Catch that pup!'],
  [{ do: 'chase', who: 'biscuit', at: 'here', time: 60, speed: 7.5, text: 'Catch Biscuit the runaway pup 🐶' }], ['Ollie: Got him! Biscuit loves you, you know.'], { money: 70, xp: 200, rel: { ollie: 15 }, stats: { fit: 0.5 } });
S('s-ollie-bones', 'Bone Appétit', 'ollie', 'pet', { m: ['s-ollie-escape'] }, ['Ollie: The shelter\'s bone delivery fell off the truck. 5 bones, somewhere out there.'],
  [{ do: 'collect', what: 'bone', n: 5, near: 'here', text: 'Collect 5 bones 🦴' }], ['Ollie: The dogs are throwing a party.'], { money: 80, xp: 180, rel: { ollie: 10 } });
S('s-jay-loot', 'Loot Boxes', 'jay', 'tech', { m: ['c4-jay'] }, ['Jay: Sticker packs are real-life loot boxes. Get 3 more for your album. Shops sell them, or find them lying around.'],
  [{ do: 'own', what: 'stickers', n: 12, text: 'Collect 12 different stickers 🎴' }], ['Jay: Your album is looking stacked.'], { xp: 200, items: { pack: 2 }, rel: { jay: 10 } });
S('s-jay-battery', 'Power Up', 'jay', 'tech', { m: ['s-jay-loot'] }, ['Jay: I\'m building a robot. It needs 4 batteries. Please don\'t ask what the robot is for.'],
  [{ do: 'collect', what: 'battery', n: 4, near: 'here', text: 'Find 4 batteries 🔋' }, { do: 'go', to: 'giver', text: 'Bring them to Jay' }], ['Jay: It lives! It... makes toast. Perfect toast.'], { money: 100, xp: 220, stats: { smarts: 1 } });
S('s-max-busk', 'Busking', 'max', 'home', { m: ['c4-zoe'] }, ['Max: My band is playing on the street and needs a dancer to draw a crowd. You in? At {place}.'],
  [{ do: 'dance', at: 'landmark', n: 10, text: 'Dance with Max\'s band at {place}' }], ['Max: We made $47 and a half! Here\'s your cut.'], { money: 60, xp: 180, rel: { max: 15 }, happy: 6 });
S('s-max-amp', 'Band Practice', 'max', 'home', { m: ['s-max-busk'] }, ['Max: I left my amp at my drummer\'s place. Bring it to our bassist? Bands are complicated.'],
  [{ do: 'deliver', item: 'amp', to: 'addr', n: 1, text: 'Deliver the guitar amp' }], ['Max: Rock on, cuz.'], { money: 50, xp: 140, rel: { max: 10 } });
S('s-max-gig', 'The Big Gig', 'max', 'home', { m: ['s-max-amp'] }, ['Max: We got a real gig! At {place}! Come hang out with me there, I\'m freaking out a little.'],
  [{ do: 'escort', who: 'max', to: 'lounge', text: 'Walk Max to the gig at {place} 🎸' }, { do: 'dance', at: 'here', n: 12, text: 'Rock the show' }], ['Max: That was the best night of my life. You\'re the best cousin. Best FRIEND.'], { money: 200, xp: 400, rel: { max: 30 }, friend: 'max', happy: 12 });
S('s-dmitri-parts', 'Grease Monkey', 'dmitri', 'garage', { m: ['c3-bike'] }, ['Dmitri: A delivery truck lost a box of parts all over the street. Find 4 for me.'],
  [{ do: 'collect', what: 'part', n: 4, near: 'here', text: 'Find 4 spare parts ⚙️' }], ['Dmitri: Every one of them. You have a mechanic\'s eye.'], { money: 70, xp: 160, rel: { dmitri: 10 } });
S('s-dmitri-test', 'Test Drive', 'dmitri', 'garage', { m: ['c3-scooter'] }, ['Dmitri: I tuned your scooter. Take it for a spin: 5 checkpoints, 60 seconds.'],
  [{ do: 'race', n: 5, time: 60, ride: 'drive', text: 'Test drive: 5 checkpoints on a scooter or in a car' }], ['Dmitri: Purrs like a kitten.'], { money: 100, xp: 220, rel: { dmitri: 10 } });
S('s-sam-florist', "Florist's Helper", 'sam', 'flowers', { m: ['c5-coffee'] }, ['Sam: Busy day! Can you deliver 3 bouquets for me? I\'ll make it up to you.'],
  [{ do: 'deliver', item: 'package', to: 'addr', n: 3, text: 'Deliver 3 bouquets ({n} left)' }], ['Sam: You\'re the best delivery person I\'ve ever kissed. Er. Had.'], { money: 70, xp: 180, rel: { sam: 10 } });
S('s-sam-movie', 'Movie Night', 'sam', 'flowers', { m: ['c5-ask'] }, ['Sam: Movie night! Walk me to {place}? You pick the film. Not the scary one.'],
  [{ do: 'escort', who: 'sam', to: 'cinema', text: 'Take Sam to {place} 🍿' }, { do: 'pay', money: 30, at: 'here', text: 'Buy two tickets ($30)' }], ['Sam: You picked the scary one. I knew you would.'], { xp: 220, rel: { sam: 15 }, happy: 10 });
S('s-sam-anniv', 'Anniversary', 'sam', 'flowers', { m: ['c8-wedding'] }, ['Sam (in a text): Happy anniversary!! Don\'t you dare forget. 💕'],
  [{ do: 'buy', item: 'necklace', text: 'Buy a necklace 📿' }, { do: 'escort', who: 'sam', to: 'restaurant', text: 'Anniversary dinner at {place}' }], ['Sam: You remembered! And the necklace! I love you.'], { xp: 600, rel: { sam: 20 }, happy: 15, items: { necklace: -1 } });
S('s-kid-icecream', 'Ice Cream Promise', 'sam', 'home', { m: ['c8-school'] }, ['{kid}: You PROMISED ice cream if I was good at the dentist. I was SO good.'],
  [{ do: 'escort', who: 'kid', to: 'icecream', text: 'Take {kid} for ice cream 🍦' }], ['{kid}: Best. Day. Ever.'], { xp: 300, happy: 12 });
S('s-kid-science', 'Science Fair', 'sam', 'home', { m: ['c8-school'] }, ['{kid}: My science fair project needs batteries and a library book! Help!'],
  [{ do: 'collect', what: 'battery', n: 3, near: 'here', text: 'Find 3 batteries 🔋' }, { do: 'go', to: 'library', text: 'Borrow a book at {place}' }, { do: 'go', to: 'home', text: 'Bring it all home' }], ['{kid}: First prize!! The volcano erupted AND made toast.'], { xp: 400, happy: 15, stats: { smarts: 1 } });
S('s-kid-kite', 'Up, Up and Away', 'sam', 'home', { m: ['c8-school'] }, ['{kid}: Can we fly a kite? Pleeeease?'],
  [{ do: 'buy', item: 'kite', text: 'Buy a kite 🪁 at a toy shop' }, { do: 'escort', who: 'kid', to: 'park', text: 'Fly it with {kid} at {place}' }], ['{kid}: It went SO high! Higher than a bird!'], { xp: 300, happy: 15, items: { kite: -1 } });
S('s-tourist', 'Lost Tourist', 'tourist', 'metro', { m: ['c1-coffee'] }, ['Tourist: Excuse me! I\'m trying to find a famous landmark here. My map is upside down. Or I am. Help?'],
  [{ do: 'escort', who: 'tourist', to: 'landmark', text: 'Guide the tourist to {place}' }], ['Tourist: Wonderful! Your city is lovely. Here, a tip!'], { money: 45, xp: 130, stats: { charm: 0.5 } });
S('s-grandpa', "Grandpa Walt's Walk", 'grandpa', 'park', { m: ['c1-rosa'] }, ['Walt: I used to deliver mail on these streets for forty years. Walk with me to {place}? Slowly. My knees are older than this neighbourhood.'],
  [{ do: 'escort', who: 'grandpa', to: 'post', speed: 2.5, text: 'Walk Grandpa Walt to {place} (slowly!)' }], ['Walt: Thank you, kid. Did I tell you about the time a goose chased me for six blocks? Another day.'], { money: 30, xp: 160, happy: 6, stats: { charm: 1 } });
S('s-busker', "Busker's Hat", 'busker', 'landmark', { m: ['c1-couch'] }, ['Mo: The wind blew my tip hat over and coins went everywhere! Help me find 10?'],
  [{ do: 'collect', what: 'coin', n: 10, text: 'Collect 10 coins for Mo 🪙' }], ['Mo: You\'re honest! Here\'s a song for you. *plays something lovely*'], { xp: 140, happy: 5, stats: { charm: 0.5 } });
S('s-pigeons', 'Pigeon Whisperer', 'grandpa', 'park', { m: ['s-grandpa'] }, ['Walt: Feeding the pigeons is my favourite thing. Buy a baguette and bring it to {place}.'],
  [{ do: 'buy', item: 'baguette', text: 'Buy a baguette 🥖' }, { do: 'go', to: 'park', text: 'Feed the pigeons at {place}' }], ['Walt: Look at them! Every single one is named Gerald.'], { xp: 140, happy: 8, items: { baguette: -1 } });
S('s-leaves', 'Autumn Leaves', 'noor', 'museum', { m: ['s-noor-pigeon'] }, ['Noor: I\'m making a collage. Find me 5 perfect leaves.'],
  [{ do: 'collect', what: 'leaf', n: 5, near: 'here', text: 'Collect 5 perfect leaves 🍁' }], ['Noor: Perfectly imperfect.'], { money: 70, xp: 160, rel: { noor: 8 } });
S('s-eggs', 'Golden Eggs', 'jay', 'tech', { m: ['s-jay-loot'] }, ['Jay: I hid 5 golden eggs around the neighbourhood as an ARG. Nobody found them. Can you?'],
  [{ do: 'collect', what: 'egg', n: 5, near: 'here', text: 'Find Jay\'s 5 golden eggs 🥚' }], ['Jay: You found them all! Prize: my eternal respect. And money.'], { money: 250, xp: 300 });
S('s-glitter', 'Glitter Bomb', 'zoe', 'lounge', { m: ['s-zoe-flyers'] }, ['Zoe: The party store exploded. Not literally. Glitter is everywhere. I want it back. Collect 6 piles!'],
  [{ do: 'collect', what: 'glitter', n: 6, near: 'here', text: 'Collect 6 piles of glitter ✨' }], ['Zoe: My set will SPARKLE.'], { money: 90, xp: 180, stats: { style: 1 } });
S('s-names', 'Hello, My Name Is', 'priya', 'bank', { m: ['c2-lemons'] }, ['Priya: Networking! Talk to 5 people on the street. Business is about people.'],
  [{ do: 'chat', n: 5, text: 'Chat with 5 people on the street 💬' }], ['Priya: See? Everybody knows a guy who knows a guy.'], { money: 60, xp: 150, stats: { charm: 1 } });
S('s-kai-spots', 'Spot Check', 'kai', 'park', { m: ['c4-kai'] }, ['Kai: Scout skate spots for me: snap 2 parks and a plaza... I mean, a landmark.'],
  [{ do: 'photo', of: 'park', text: 'Snap a park 🛹' }, { do: 'photo', of: 'landmark', text: 'Snap a landmark' }], ['Kai: Gnarly spots, dude.'], { money: 70, xp: 180, rel: { kai: 10 } });
S('s-kai-trick', 'Tre Flip Trial', 'kai', 'park', { m: ['s-kai-spots'] }, ['Kai: Board race. 7 checkpoints, 90 seconds. Only boards and scooters, no engines!'],
  [{ do: 'race', n: 7, time: 90, ride: 'ride', text: 'Board race: 7 checkpoints (skateboard, kick scooter or bike)' }], ['Kai: You\'re officially a skater now.'], { money: 120, xp: 260, stats: { cred: 2 } });
S('s-luna-mural', 'Masterpiece', 'luna', 'museum', { m: ['c6-block'] }, ['Luna: I\'m painting a giant mural. I need 8 spray cans and Style 8.'],
  [{ do: 'collect', what: 'spray', n: 8, text: 'Collect 8 spray cans 🎨' }, { do: 'stat', stat: 'style', n: 8, text: 'Reach Style 8' }], ['Luna: It\'s finished. It\'s you, by the way. On a skateboard.'], { money: 300, xp: 400, stats: { cred: 2, style: 1 } });
S('s-tomas-lesson', 'Cooking Lesson', 'tomas', 'restaurant', { m: ['c7-tomas'] }, ['Tomás: A cook must know his ingredients. Visit a grocery, a bakery and a fast food place. Taste. Learn.'],
  [{ do: 'visit', kinds: ['grocery', 'bakery', 'fastfood'], text: 'Taste-test 3 places' }, { do: 'quiz', at: 'giver', qs: QUIZ.coffee, need: 3, text: 'Answer Chef\'s questions' }], ['Tomás: Hm. You will do. Friend.'], { xp: 400, rel: { tomas: 30 }, friend: 'tomas' });
S('s-priya-network', 'Investor Pitch', 'priya', 'bank', { m: ['c7-laundry'] }, ['Priya: Investors want to meet you at {place}. Dress sharp. Style 10.'],
  [{ do: 'stat', stat: 'style', n: 10, text: 'Reach Style 10' }, { do: 'go', to: 'hotel', text: 'Meet investors at {place}' }, { do: 'quiz', at: 'here', qs: QUIZ.posh, need: 3, text: 'Charm the investors' }], ['Priya: They loved you. Money is on the way.'], { money: 5000, xp: 800, stats: { smarts: 1 } });
S('s-gym', 'Pump It Up', 'kim', 'park', { m: ['s-kim-gym'] }, ['Kim: Book a personal training session at a gym. I\'ll know if you skip it.'],
  [{ do: 'buy', item: 'workout', text: 'Do a personal training session 🏋️' }], ['Kim: Feel the burn!'], { xp: 150, money: 25 });
S('s-salon', 'Fresh Cut', 'max', 'home', { m: ['c5-meet'] }, ['Max: Cuz, that haircut. Go to a salon. For all our sakes.'],
  [{ do: 'buy', item: 'haircut', text: 'Get a haircut ✂️' }], ['Max: You look like a whole new person. A better one.'], { xp: 120 });
S('s-museum', 'Culture Vulture', 'okafor', 'library', { m: ['s-prof-quiz'] }, ['Okafor: Visit a museum. Properly. Buy a ticket and look at things.'],
  [{ do: 'buy', item: 'museum', text: 'Visit a museum 🏺' }], ['Okafor: And what did you learn? ...Good answer.'], { xp: 160, stats: { smarts: 0.5 } });
S('s-cinema', 'Popcorn Break', 'jay', 'tech', { m: ['c4-jay'] }, ['Jay: New movie\'s out! Watch it and tell me if it\'s good. No spoilers.'],
  [{ do: 'buy', item: 'movie', text: 'Watch a movie 🍿' }], ['Jay: It was good?! I KNEW IT.'], { xp: 140, happy: 5, rel: { jay: 8 } });
S('s-pet', 'Purr-fect Companion', 'ollie', 'pet', { m: ['s-ollie-fetch'] }, ['Ollie: Have you considered a cat? They mostly ignore you, it\'s very relaxing.'],
  [{ do: 'buy', item: 'cat', text: 'Adopt a cat 🐈' }], ['Ollie: Look, it\'s ignoring you already. That means love.'], { xp: 300, happy: 10, rel: { ollie: 10 } });
S('s-stickers', 'Set Collector', 'jay', 'tech', { m: ['s-jay-loot'] }, ['Jay: Complete one full sticker set. Duplicates can be swapped in the album.'],
  [{ do: 'own', what: 'sets', n: 1, text: 'Complete a sticker set 🎴' }], ['Jay: Set bonus unlocked! Collect them all.'], { xp: 400, items: { pack: 3 } });
S('s-rich', 'High Roller', 'priya', 'bank', { m: ['c7-tycoon'] }, ['Priya: Let\'s see $100,000 in the bank. Well, in your pocket.'],
  [{ do: 'have', money: 100000, text: 'Have $100,000' }], ['Priya: Six figures! Shall we look at hotels?'], { xp: 3000, stats: { smarts: 2 } });
S('s-hotel', 'Five Stars', 'priya', 'bank', { m: ['s-rich'] }, ['Priya: The boutique hotel is for sale. $1.5 million. The final boss of business.'],
  [{ do: 'own', what: 'bizid', id: 'hotel', text: 'Buy the boutique hotel 🏨' }], ['Priya: Welcome to the top.'], { xp: 8000, happy: 20 });
S('s-night-owl', 'Night Owl', 'zoe', 'lounge', { m: ['c4-zoe'] }, ['Zoe: The city looks different at night. Meet me at {place} between 22:00 and 3:00.'],
  [{ do: 'go', to: 'lounge', when: [22, 3], text: 'Go to {place} late at night (22:00–3:00) 🌙' }, { do: 'dance', at: 'here', n: 10, text: 'Dance till late' }], ['Zoe: Now THAT was a night.'], { money: 80, xp: 220, happy: 10, rel: { zoe: 10 } });
S('s-early-bird', 'Early Bird', 'kim', 'park', { m: ['s-kim-5k'] }, ['Kim: Champions train at dawn. Meet me at {place} between 5:00 and 8:00.'],
  [{ do: 'go', to: 'park', when: [5, 8], text: 'Be at {place} at dawn (5:00–8:00) 🌅' }, { do: 'race', n: 4, time: 55, ride: 'foot', text: 'Dawn sprint: 4 checkpoints' }], ['Kim: The early bird gets the gains!'], { xp: 260, stats: { fit: 2 } });
S('s-metro', 'Underground', 'tourist', 'metro', { m: ['s-tourist'] }, ['Tourist: Which way is the metro? Can you show me two different stations? I want to ride them all!'],
  [{ do: 'visit', kinds: ['metro'], text: 'Visit a metro station' }, { do: 'photo', of: 'metro', text: 'Photograph a metro entrance 🚇' }], ['Tourist: Thank you! Metro stations are fast travel, did you know? Tap one to ride.'], { money: 40, xp: 150 });
// Hills (real heights from the Mapterhorn elevation map): the highest street near home, and an uphill race
S('s-hilltop', 'Top of the Hill', 'noor', 'museum', { m: ['c4-noor'] }, ['Noor: Every neighbourhood has a highest street. The light up there is different. Find it and bring me the view.'],
  [{ do: 'go', to: 'hilltop', text: 'Climb to {place} ⛰️' }, { do: 'photo', of: 'hilltop', text: 'Photograph the view from the top 📸' }],
  ['Noor: Look how far you can see! I\'m framing this one.'], { money: 60, xp: 220, happy: 8, stats: { fit: 1 }, rel: { noor: 10 }, sticker: 'hilltop' });
S('s-hill-race', 'King of the Hill', 'kai', 'park', { m: ['s-hilltop', 'c3-ollie'] }, ['Kai: Uphill race, dude. Every checkpoint is higher than the last. Board, kick scooter or bike. Your legs will hate you.'],
  [{ do: 'race', n: 4, time: 80, ride: 'ride', hill: true, text: 'Uphill race on wheels: 4 checkpoints, each one higher 🛹' }],
  ['Kai: You climbed that?! The ride down is the reward.'], { money: 120, xp: 300, stats: { fit: 1 }, rel: { kai: 10 }, sticker: 'cablecar' });

D.QUIZ = QUIZ;

// Repeatable odd jobs (phone → Odd jobs). Generated each game day from these templates.
D.JOBS = [
  { t: 'Courier run', e: '📦', steps: [{ do: 'deliver', item: 'package', to: 'addr', n: 2, text: 'Deliver 2 packages ({n} left)' }], pay: [30, 60] },
  { t: 'Flyer drop', e: '📄', steps: [{ do: 'deliver', item: 'flyers', to: 'addr', n: 3, text: 'Drop 3 flyers ({n} left)' }], pay: [35, 70] },
  { t: 'Pizza delivery', e: '🍕', steps: [{ do: 'deliver', item: 'pizza', to: 'addr', n: 1, time: 120, text: 'Deliver a hot pizza in 2 minutes' }], pay: [40, 80] },
  { t: 'Dog walk', e: '🐕', steps: [{ do: 'escort', who: 'rex', to: 'park', text: 'Walk a dog to {place}' }], pay: [30, 55] },
  { t: 'Medicine run', e: '💊', steps: [{ do: 'go', to: 'pharmacy', text: 'Pick up medicine at {place}' }, { do: 'deliver', item: 'medicine', to: 'addr', n: 1, text: 'Deliver the medicine' }], pay: [45, 85] },
  { t: 'Coffee run', e: '☕', steps: [{ do: 'go', to: 'cafe', text: 'Pick up a coffee order at {place}' }, { do: 'deliver', item: 'package', to: 'addr', n: 1, time: 150, text: 'Deliver it while it\'s hot' }], pay: [35, 65] },
  { t: 'Lost & found', e: '🔍', steps: [{ do: 'collect', what: 'clue', n: 3, near: 'here', text: 'Find 3 lost items 🔍' }], pay: [40, 75] },
  { t: 'Survey', e: '📋', steps: [{ do: 'chat', n: 4, text: 'Interview 4 people on the street' }], pay: [30, 60] },
  { t: 'Photo gig', e: '📸', steps: [{ do: 'photo', of: 'landmark', text: 'Photograph {place}' }], pay: [35, 70] },
  { t: 'Hill climb', e: '⛰️', steps: [{ do: 'race', n: 4, time: 75, ride: 'foot', hill: true, text: 'Run uphill: 4 checkpoints, each one higher' }], pay: [40, 80] },
];

// People on the street say these. {place} = a real place nearby.
D.CHATTER = [
  'Lovely day, isn\'t it?', 'Have you tried {place}? So good.', 'Watch out for the pigeons, they\'re organized.', 'I think I\'m lost. Again.',
  'My dog likes you!', 'Is it just me or are there coins everywhere?', 'Nonna Rosa\'s cannoli changed my life.', 'Rent is SO expensive.',
  'Did you see the new mural? Gorgeous.', 'I\'m late! Sorry!', 'Nice shoes!', 'They say a gem is hidden somewhere around here...',
  'I heard Chad Moneybags wants to build a parking tower.', 'Have a great day!', 'Busy busy busy.', 'Ever been to {place}? Ask for the special.',
  'You look familiar. Are you famous?', 'Coffee first. Words later.', 'The Skate Rats are fast, man.', 'Bonjour! Hi!', 'Love your vibe.',
];
D.PED_TIPS = ['Here, for your trouble! (+$2)', 'You dropped this! (+$1)', 'Take a sticker pack, I don\'t collect anymore.', ''];

D.TIPS = [
  'The gold arrow over your head points to your goal. The minimap shows everything around you.',
  'Hold Shift to sprint (it uses energy). Coffee and food bring energy back.',
  'Press E near people, shops and markers. Press P for your phone. Press V to ride.',
  'Stat pickups (📚 🌹 🏋️ 🕶️ 🎨) each add a quarter point. Shops and classes add more.',
  'Businesses fill their till every hour. Visit them to collect, or hire a manager.',
  'Taking over a block: tag its 4 crew posters, then beat the boss.',
  'Metro entrances 🚇 are fast travel: ride to any station you\'ve visited.',
  'Happiness boosts your income. Homes, friends, family and fun all add to it.',
  'Each game day is 24 minutes. Rent is due at midnight; business income never stops.',
  'Press F to bonk. Monsters come out after dark and pop into coins. Bakeries sell baguettes. Just saying.',
  'Space twice is a double jump. Land on a parked car for a big bounce.',
  'Talk to strangers: say hi, tell a joke, or flirt. Sweethearts wait for you around town.',
  'Street folk remember kindness. Enough street hearts and they crown you.',
  'Made-up shops can be pranked. The owner will chase you. You are faster. Probably.',
  'Banana peels are not a hazard. They are a free speed boost.',
];

// ================================================================================================ the wacky update
// Silly weapons, monsters, street life (flirting, street folk, pranks, grudges) and random street events.
// cft-fun.js runs all of it; the data lives here.

// Two kinds of shop that only exist as made-up shops (the map has no such places).
D.KINDS.joke = { e: '🤡', n: 'Joke shop', fake: ['Ha Ha Hut', 'The Whoopee Emporium', 'Gag Reflex', 'Pranks a Lot', 'Rubber Chicken & Co.'], sells: ['w_chicken', 'w_noodle', 'w_plunger', 'fakenose', 'whoopee'] };
D.KINDS.fortune = { e: '🔮', n: 'Fortune teller', fake: ['Madame Zaza', 'The Third Eye', 'Mystic Mo', 'Tomorrow, Today'], sells: ['fortune', 'luckycharm'] };

// Weapons are gear for the "weapon" slot. dmg = hit points per bonk, reach in metres, knock = how far things fly,
// stun = seconds a monster stays dizzy, ranged: 'cone' (a blast in front) or 'shot' (flies until it hits).
Object.assign(D.ITEMS, {
  w_baguette: { n: 'Stale baguette', e: '🥖', p: 12, type: 'gear', slot: 'weapon', weapon: { dmg: 1, reach: 2.7, knock: 3, mesh: 'baguette', word: 'BONK!' } },
  w_chicken: { n: 'Rubber chicken', e: '🐔', p: 35, type: 'gear', slot: 'weapon', weapon: { dmg: 1, reach: 2.5, knock: 3, stun: 2.5, mesh: 'chicken', word: 'SQUEAK!' } },
  w_pillow: { n: 'Feather pillow', e: '🪶', p: 30, type: 'gear', slot: 'weapon', weapon: { dmg: 1, reach: 2.6, knock: 8, mesh: 'pillow', word: 'FLOOF!', puff: '🪶' } },
  w_noodle: { n: 'Pool noodle', e: '🏖️', p: 45, type: 'gear', slot: 'weapon', weapon: { dmg: 2, reach: 3.6, knock: 4, mesh: 'noodle', word: 'THWAP!' } },
  w_fish: { n: 'Frozen fish', e: '🐟', p: 60, type: 'gear', slot: 'weapon', weapon: { dmg: 2, reach: 2.6, knock: 4, mesh: 'fish', word: 'SLAP!' } },
  w_plunger: { n: 'Plunger of destiny', e: '🪠', p: 90, type: 'gear', slot: 'weapon', stats: { cred: 1 }, weapon: { dmg: 2, reach: 2.8, knock: 2, stun: 3, mesh: 'plunger', word: 'SHLOP!' } },
  w_blower: { n: 'Leaf blower', e: '🍃', p: 380, type: 'gear', slot: 'weapon', weapon: { dmg: 2, reach: 9, knock: 11, ranged: 'cone', mesh: 'blower', word: 'WHOOSH!', puff: '🍃' } },
  w_guitar: { n: 'Smashing guitar', e: '🎸', p: 650, type: 'gear', slot: 'weapon', stats: { cred: 1, style: 1 }, weapon: { dmg: 4, reach: 2.9, knock: 5, mesh: 'guitar', word: 'KERRANG!', puff: '🎵' } },
  w_bubble: { n: 'Bubble blaster', e: '🫧', p: 900, type: 'gear', slot: 'weapon', req: { lvl: 6 }, weapon: { dmg: 3, reach: 18, knock: 4, ranged: 'shot', mesh: 'bubble', word: 'BLOOP!', puff: '🫧' } },
  fakenose: { n: 'Fake nose and glasses', e: '🥸', p: 20, type: 'gear', slot: 'acc', stats: { charm: 1, cred: 1 } },
  whoopee: { n: 'Whoopee cushion', e: '🎈', p: 8, type: 'gift', rel: 6 },
  fortune: { n: 'Your fortune', e: '🔮', p: 10, type: 'service', fortune: true },
  luckycharm: { n: 'Lucky rabbit sock', e: '🧦', p: 150, type: 'gear', slot: 'bag', stats: { charm: 1, cred: 1 }, happy: 3 },
});
D.KINDS.bakery.sells.push('w_baguette');
D.KINDS.toys.sells.push('w_chicken', 'w_noodle');
D.KINDS.furniture.sells.unshift('w_pillow');
D.KINDS.grocery.sells.push('w_fish');
D.KINDS.hardware.sells.push('w_plunger', 'w_blower');
D.KINDS.music.sells.push('w_guitar');
D.KINDS.tech.sells.push('w_bubble');
D.SLAP = { dmg: 0.5, reach: 2.1, knock: 2, mesh: null, word: 'SLAP!' };   // bare hands

// Monsters ("figments": the city's noise taking shape, only you see them). hp, speed (m/s; your sprint beats all of them),
// atk = health you lose per hit (before armour), steal = coins grabbers take ([0, 0] = they only hit), coins = what pops out,
// w = spawn weight, night: only after dark, boss: one at a time, announced. Levels scale with yours and with the distance from home.
D.MONSTERS = {
  slime: { n: 'Sidewalk slime', e: '🟢', hp: 2, speed: 3.2, atk: 5, steal: [1, 4], coins: [3, 5], xp: 12, w: 10 },
  cone: { n: 'Cone gremlin', e: '🚧', hp: 2, speed: 5.2, atk: 5, steal: [1, 3], coins: [3, 5], xp: 14, w: 7 },
  bin: { n: 'Trash goblin', e: '🗑️', hp: 3, speed: 4.2, atk: 7, steal: [2, 6], coins: [4, 7], xp: 18, w: 7 },
  sock: { n: 'Lost-sock ghost', e: '🧦', hp: 3, speed: 3.7, atk: 6, steal: [2, 5], coins: [5, 7], xp: 20, w: 5, night: true },
  pigeon: { n: 'Pigeonzilla', e: '🐦', hp: 7, speed: 4.6, atk: 12, steal: [5, 12], coins: [11, 15], xp: 60, w: 1.2, size: 1.5, cash: true },
  blob: { n: 'King Blob', e: '👑', hp: 16, speed: 3.6, atk: 20, steal: [10, 25], coins: [22, 28], xp: 180, w: 0, boss: true, gem: true },
  goose: { n: 'Furious goose', e: '🪿', hp: 4, speed: 6.6, atk: 4, steal: [1, 2], coins: [6, 8], xp: 30, w: 0 },
  rat: { n: 'Gutter rat', e: '🐀', hp: 2, speed: 6.4, atk: 4, steal: [1, 3], coins: [2, 4], xp: 10, w: 9 },
  raccoon: { n: 'Trash bandit', e: '🦝', hp: 3, speed: 5.6, atk: 6, steal: [3, 8], coins: [4, 7], xp: 18, w: 6 },
  wisp: { n: 'Static wisp', e: '👻', hp: 3, speed: 3.6, atk: 8, steal: [0, 0], coins: [4, 7], xp: 22, w: 5, night: true },
  cart: { n: 'Cart golem', e: '🛒', hp: 5, speed: 4.8, atk: 10, steal: [0, 0], coins: [6, 9], xp: 30, w: 4 },
  spider: { n: 'Cable spider', e: '🕷️', hp: 3, speed: 5.8, atk: 7, steal: [0, 0], coins: [4, 7], xp: 22, w: 5, night: true },
  worm: { n: 'Subway worm', e: '🪱', hp: 7, speed: 3.0, atk: 14, steal: [0, 0], coins: [8, 12], xp: 45, w: 2 },
  gargoyle: { n: 'Rooftop gargoyle', e: '🗿', hp: 6, speed: 4.4, atk: 12, steal: [0, 0], coins: [8, 12], xp: 40, w: 2.5 },
  brute: { n: 'Brick brute', e: '🧱', hp: 9, speed: 3.2, atk: 18, steal: [0, 0], coins: [10, 15], xp: 60, w: 1.5, size: 1.3 },
};
// Same monster, a local name: hand-written for some cities (by map box), otherwise picked from these by where you live.
D.CITIES = [
  { id: 'montreal', n: 'Montréal', lat: [45.38, 45.72], lon: [-74.0, -73.45] }, { id: 'newyork', n: 'New York', lat: [40.48, 40.95], lon: [-74.3, -73.68] },
  { id: 'paris', n: 'Paris', lat: [48.78, 48.95], lon: [2.2, 2.48] }, { id: 'london', n: 'London', lat: [51.35, 51.65], lon: [-0.45, 0.25] },
  { id: 'riga', n: 'Riga', lat: [56.88, 57.05], lon: [23.95, 24.3] }, { id: 'tokyo', n: 'Tokyo', lat: [35.5, 35.85], lon: [139.5, 139.95] },
];
D.CITY_MONSTERS = {
  montreal: { slime: 'Slush Slurper', cone: 'Orange Cone Goblin', bin: 'Compost-Bin Gobbler', sock: 'Lost Mitten Ghost', pigeon: 'Grand Pigeon du Plateau', blob: 'King Poutine',
    goose: 'Goose of Doom', rat: 'Ruelle Rat', raccoon: 'Mountain Bandit', wisp: 'River Fog Wisp', cart: 'Dépanneur Cart Golem', spider: 'Hydro-Pole Spider',
    worm: 'Orange Line Worm', gargoyle: 'Church-Roof Gargoyle', brute: 'Triplex Brute' },
  newyork: { slime: 'Subway Slime', cone: 'Detour Cone Imp', bin: 'Bodega Bin Goblin', sock: 'Laundromat Ghost', pigeon: 'Big Apple Pigeon', blob: 'King Bagel',
    goose: 'Park Goose', rat: 'Pizza Rat', raccoon: 'Brooklyn Bandit', wisp: 'Steam-Vent Wisp', cart: 'Bodega Cart Golem', spider: 'Fire-Escape Spider',
    worm: 'Express-Track Worm', gargoyle: 'Skyscraper Gargoyle', brute: 'Brownstone Brute' },
  paris: { slime: 'Slime du Caniveau', cone: 'Bollard Gremlin', bin: 'Poubelle Goblin', sock: 'Lost Beret Ghost', pigeon: 'Bridge Pigeon', blob: 'King Croissant',
    goose: 'River Goose', rat: 'Catacomb Rat', raccoon: 'Boulevard Bandit', wisp: 'Seine Mist', cart: 'Market Cart Golem', spider: 'Balcony Spider',
    worm: 'Métro Worm', gargoyle: 'Cathedral Gargoyle', brute: 'Limestone Brute' },
  london: { slime: 'Drizzle Slime', cone: 'Roadworks Imp', bin: 'Wheelie-Bin Goblin', sock: 'Lost Brolly Ghost', pigeon: 'Square Pigeon', blob: 'King Pudding',
    goose: 'Pond Goose', rat: 'Tube Rat', raccoon: 'Urban Fox Bandit', wisp: 'Pea-Souper Wisp', cart: 'Market Barrow Golem', spider: 'Chimney Spider',
    worm: 'Deep-Line Worm', gargoyle: 'Abbey Gargoyle', brute: 'Terrace Brute' },
  riga: { slime: 'River Slime', cone: 'Cobble Cone Imp', bin: 'Courtyard Bin Goblin', sock: 'Lost Mitten Ghost', pigeon: 'Old Town Pigeon', blob: 'King Rye Bread',
    goose: 'Canal Goose', rat: 'Market-Hall Rat', raccoon: 'Art Nouveau Bandit', wisp: 'Baltic Fog Wisp', cart: 'Market Cart Golem', spider: 'Spire Spider',
    worm: 'Tram-Track Worm', gargoyle: 'Black-Cat Gargoyle', brute: 'Wooden-House Brute' },
  tokyo: { slime: 'Rainy-Season Slime', cone: 'Roadwork Cone Imp', bin: 'Konbini Bin Goblin', sock: 'Lost Umbrella Ghost', pigeon: 'Shrine Pigeon', blob: 'King Mochi',
    goose: 'Moat Goose', rat: 'Alley Rat', raccoon: 'Tanuki Bandit', wisp: 'Neon Wisp', cart: 'Vending Cart Golem', spider: 'Wire Spider',
    worm: 'Loop-Line Worm', gargoyle: 'Shrine-Roof Gargoyle', brute: 'Concrete Brute' },
};
D.MONSTER_LOCAL = {
  slime: ['Sidewalk Slime', 'Puddle Slurper', 'Drain Ooze', 'Gutter Gloop'], cone: ['Cone Gremlin', 'Detour Imp', 'Roadblock Goblin', 'Pylon Pest'],
  bin: ['Trash Goblin', 'Bin Gobbler', 'Rubbish Grub', 'Dumpster Imp'], sock: ['Lost-Sock Ghost', 'Odd-Glove Ghost', 'Laundry Spook', 'Missing-Mitten Ghost'],
  pigeon: ['Pigeonzilla', 'Mega Pigeon', 'Colossal Coo', 'Pigeon Prime'], blob: ['King Blob', 'Emperor Ooze', 'Grand Gloop', 'Sovereign Slime'],
  goose: ['Furious Goose', 'Honk Beast', 'Goose of Grudges', 'Hissing Goose'], rat: ['Gutter Rat', 'Alley Rat', 'Sewer Scamp', 'Curb Rat'],
  raccoon: ['Trash Bandit', 'Masked Bandit', 'Bin Burglar', 'Night Bandit'], wisp: ['Static Wisp', 'Fog Wisp', 'Streetlight Wisp', 'Hum Wisp'],
  cart: ['Cart Golem', 'Trolley Golem', 'Rogue Cart', 'Wonky-Wheel Golem'], spider: ['Cable Spider', 'Wire Weaver', 'Pole Spider', 'Gutter Spider'],
  worm: ['Subway Worm', 'Tunnel Worm', 'Manhole Worm', 'Pipe Worm'], gargoyle: ['Rooftop Gargoyle', 'Ledge Gargoyle', 'Cornice Gargoyle', 'Gutter-Spout Gargoyle'],
  brute: ['Brick Brute', 'Masonry Brute', 'Rubble Brute', 'Wall Brute'],
};
// metro guardians: a big monster at every station entrance; beat it and the station joins your metro network
D.GUARDIANS = { brute: 'Turnstile Titan', worm: 'Tunnel Wyrm', gargoyle: 'Platform Gargoyle', cart: 'Rush-Hour Juggernaut', spider: 'Escalator Weaver' };
// what passers-by say when you fight things they can't see (kindly)
D.STATIC_LINES = ['Nice shadow-boxing!', 'Ooh, karate?', 'Rough day? Me too.', 'You good? ...You got this.', 'Is that a new workout?', 'Whatever it is, you won.'];
D.MONSTER_LINES = ['Blorp!', 'Grrr!', 'Mine! MINE!', 'Coins... coooins...', 'Boo!', 'Nom nom nom', 'Rawr (small)', 'Gimme!'];
D.MONSTER_LINES.push('Bzzzt...', '*static*', 'You can\'t ignore me!', 'Hssss!');
D.MONSTER_TITLES = [[1, 'Monster bonker'], [10, 'Night watch'], [30, 'Slime time'], [75, 'Monster hunter'], [150, 'Legend of the night shift']];

// Shenanigans with strangers
D.CRUSH_NAMES = ['Alex', 'Robin', 'Charlie', 'Jules', 'Sacha', 'Camille', 'Morgan', 'Remy', 'Noa', 'Elliot', 'Dominique', 'Frankie', 'Jordan', 'Ari', 'Sky', 'Rowan',
  'Quinn', 'Maxime', 'Lou', 'Andrea', 'Riley', 'Casey', 'Jamie', 'Taylor', 'Avery', 'Devon', 'Kit', 'Sasha', 'Blake', 'Harper', 'Emery', 'Marlo'];
D.FLIRT = {
  lines: [
    'Are you a parking ticket? Because you\'ve got "fine" written all over you.',
    'Is your name Wi-Fi? Because I\'m feeling a connection.',
    'Do you have a map? I keep getting lost in your eyes. (I do have a minimap, though.)',
    'If you were a pickup, you\'d be a gem.',
    'Are you from this neighbourhood? Because you just raised its property value.',
    'I\'d cross a street on a red light for you. Looking both ways, obviously.',
    'Are you a coin? Because I\'d run across town to pick you up.',
    'Nonna Rosa told me to find someone nice. Hi.',
  ],
  yes: ['Ha! Okay, that was terrible. I love it. 💕', 'Smooth. Come find me later.', 'You\'re ridiculous. Here\'s my number.', 'Oh no. That worked on me.', 'Stop it. (Don\'t stop.)', '*blushes in pedestrian*'],
  no: ['Wow. No.', 'I have a pigeon to feed. Bye.', 'Did that ever work on anyone?', 'I\'m calling my mother to tell her about this.', 'Ha. Ha. No.', 'Try that again when you\'ve showered.'],
  taken: ['Your {pt} is RIGHT THERE.', 'Aren\'t you with someone? Shoo.'],
  sweet: ['There\'s my favourite person!', 'I was hoping you\'d walk by.', 'Look who it is. 💕', 'I saved you a smile.', 'You again! Good.', 'My day just got better.'],
  miss: ['Oh. You remember I exist?', 'It\'s been days...', 'I almost gave your nickname to my plant.'],
  date: ['That was lovely.', 'Best. Walk. Ever.', 'Same time tomorrow?', 'You make this street look good.'],
  drama: ['WHO IS THAT?!', 'So I\'m "the only one", huh?!', 'You said you were at the LIBRARY!', 'Hold my handbag. Actually, no: FEEL my handbag!'],
  gone: '{n} moved on and gave your nickname to a houseplant.',
};
D.CRUSH_TITLES = [[1, 'Has a crush'], [3, 'Heartthrob'], [5, 'Casanova of the block'], [8, 'Legend of love']];
D.JOKES = [
  ['Why did the pigeon cross the road?', 'It was the chicken\'s day off.'], ['What do you call a fake noodle?', 'An impasta.'],
  ['Why don\'t buildings ever get lost?', 'They always know their storey.'], ['What\'s a traffic light\'s favourite food?', 'Jam.'],
  ['Why was the sidewalk so calm?', 'It was grounded.'], ['How does a taxi apologise?', 'It says "my bad" and charges you anyway.'],
  ['What did the lamp post say to the dog?', 'Not again.'], ['Why did the banana go to the doctor?', 'It wasn\'t peeling well.'],
  ['What do slimes study at school?', 'Goo-ography.'], ['Why did the bicycle fall over?', 'It was two-tired.'],
];
D.JOKE_REPLIES = { good: ['HAHA! Stop!', 'Okay that got me.', '*snort*', 'I\'m telling everyone that one.', 'Ha! Classic.'], bad: ['...', 'I don\'t get it.', 'My grandpa tells that one.', 'Boo.'] };
D.BONKED = ['Hey! Rude!', 'OW! What was that for?!', 'Did you just... with a BAGUETTE?', 'My lawyer will hear about this!', 'Unbelievable.', 'I\'m telling my mom!', 'Not the hair!'];
D.PILLOW_FIGHT = ['Pillow fight!!', 'Hahaha! Again!', 'Oh it\'s ON.', 'Feathers everywhere!'];

// Street folk: neighbours without a roof. Help them (coins, food, time) and they remember. Never the butt of the joke.
D.STREETFOLK = [
  { id: 'marcel', n: 'Marcel', e: '🎷', hi: 'Spare a coin for a retired saxophone legend?', story: ['I played every club on this street. The clubs are condos now. The saxophone is a lamp.', 'One night a goose walked on stage. Best duet of my life.'], look: { beard: true, beanie: 0x24324a, coat: 0x5b4636 } },
  { id: 'dolores', n: 'Dolores', e: '🐈', hi: 'Chairman Meow and I accept coins, tuna and compliments.', story: ['The cat is the brains of this operation. I\'m just the legs.', 'I used to run a bookshop. I still give recommendations. Free. Unstoppable.'], look: { long: true, hair: 0xd9d4cc, coat: 0x9b2c4f, scarf: 0xf2b134 } },
  { id: 'ray', n: 'Captain Ray', e: '⚓', hi: 'Ahoy! Any change for an old sailor on dry land?', story: ['Thirty years at sea. Never once saw a sea monster. Moved here: slimes everywhere.', 'A lamp post is just a lighthouse that gave up.'], look: { beard: true, hat: 0x24324a, coat: 0x2b4c7e } },
  { id: 'pete', n: 'Poet Pete', e: '📜', hi: 'A coin for a poem? Refunds in haiku only.', story: ['Roses are red, rent is absurd, I live outside, so does that bird.', 'I rhymed "orange" once. Nobody was there. I think about it every day.'], look: { glasses: true, beanie: 0x7b52c7, scarf: 0xef6aa5 } },
  { id: 'tina', n: 'Big Tina', e: '♟️', hi: 'Got a dollar? I\'ll teach you a chess opening. Got two? I\'ll let you win.', story: ['Undefeated on this corner since the spring. A pigeon came close.', 'Life is like chess. I\'m currently in the endgame with a very good knight.'], look: { long: true, beanie: 0xe8453c, coat: 0x1f2937 } },
  { id: 'gus', n: 'Old Gus', e: '🐦', hi: 'The pigeons and I would appreciate a small donation.', story: ['I know every pigeon by name. That one is Kevin. They are all Kevin.', 'People walk past. Pigeons never do. Loyal birds.'], look: { beard: true, hair: 0xd9d4cc, hat: 0x5b4636, coat: 0x6b7280 } },
  { id: 'mags', n: 'Mags', e: '🧶', hi: 'A coin, dear? I\'ll knit you into my will.', story: ['I knit scarves for the lamp posts. They look cold.', 'Forty years a seamstress. Now I mend whatever walks by. Hold still.'], look: { long: true, hair: 0xd9d4cc, glasses: true, coat: 0xc084fc, scarf: 0x2f9e6e } },
  { id: 'lint', n: 'Professor Lint', e: '🧦', hi: 'Any spare change, or better, spare socks? Singles only.', story: ['I study the migration of lost socks. They go north. Nobody believes me.', 'The ghosts at night? Socks. All socks. I\'ve published.'], look: { glasses: true, beard: true, beanie: 0xf2b134, coat: 0x3aa6b9 } },
  { id: 'sunny', n: 'Sunny', e: '🌞', hi: 'Morning! Or evening! Either way: a coin would make it sunnier.', story: ['Best view in the city, this bench. And no rent. You should see my skylight.', 'I give out free compliments. You have excellent posture.'], look: { hat: 0xf2b134, coat: 0xff8a3d } },
  { id: 'duchess', n: 'The Duchess', e: '🛒', hi: 'One may approach the cart. Tributes of coin are customary.', story: ['This cart has four wheels and a throne. Name another vehicle that does.', 'I was nearly royalty once. The paperwork was dreadful.'], look: { long: true, hair: 0x8a8a8a, coat: 0x7b52c7, scarf: 0xf4f1ea } },
];
D.FOLK_THANKS = ['Bless you, friend.', 'You\'re one of the good ones.', 'That\'s dinner sorted!', 'The street remembers.', 'Thank you. Truly.', 'May your coins be many and your slimes few.'];
D.FOLK_SNUB = ['No worries. Have a good one.', 'Next time, maybe.', 'Mind the slimes.', 'Fair enough.'];
D.FOLK_RUDE = ['Charming.', 'And a good day to you too, sunshine.', 'The pigeons heard that.'];
D.FOLK_TITLES = [[0, 'Stranger'], [3, 'Friendly face'], [8, 'Friend of the street'], [16, 'Street saint'], [28, 'Royalty in waiting'], [40, 'Crowned']];
D.CROWN_AT = 40;
D.FOLK_KING = ['All hail!', 'Your Majesty!', 'Long live the crown!', '*bows with great ceremony*', 'Looking regal today!', 'The corner is yours, boss.'];

// Pranks on made-up shops (never on real places from the map). The owner chases you; you are always a bit faster.
D.PRANKS = [
  { id: 'bell', t: '🔔 Ring the bell forty times and run', gain: { cred: 0.15 }, xp: 15 },
  { id: 'samples', t: '🧀 Eat every single free sample', gain: { energy: 30 }, xp: 15 },
  { id: 'sign', t: '🪧 Flip the sign to "CLOSED: GOOSE INSIDE"', gain: { cred: 0.25 }, xp: 20 },
  { id: 'moonwalk', t: '🕺 Moonwalk through the shop, knocking nothing over (mostly)', gain: { charm: 0.15, happy: 3 }, xp: 20 },
];
D.KEEPER_LINES = {
  bakery: ['COME BACK HERE, YOU CROUTON!', 'I\'ll knead you into next week!'], cafe: ['I will DECAF you!', 'No more loyalty stamps for you!'],
  restaurant: ['You\'re off the menu!', 'Get back here and face the dessert!'], grocery: ['Clean-up on aisle YOU!', 'That\'s a paddlin\'!'],
  flowers: ['I\'ll put you in a vase!', 'Petal pusher!'], books: ['Overdue! OVERDUE!', 'I will shush you so hard!'],
  joke: ['Not funny! Okay, a little funny! COME BACK!', 'I INVENTED that prank!'], salon: ['Bad hair day incoming!', 'I\'ll give you bangs!'],
  any: ['HEY! YOU!', 'Get back here!', 'I know your face!', 'My shop! My beautiful shop!', 'You\'ll pay for that! Literally!', 'STOP! In the name of retail!'],
};
D.KEEPER_GIVEUP = ['*wheeze* ...next time...', 'I\'m too old for this.', 'You\'re banned! BANNED!', 'I\'ll remember that face!'];
D.RIVAL_LINES = ['YOU! You\'re stealing my customers!', 'There\'s the competition! Get \'em!', 'Your {biz} is ruining me!'];
// which made-up shops see you as the competition, once you own a business
D.RIVALS = { coffee: 'cafe', lemonade: 'icecream', foodtruck: 'fastfood', pizzeria: 'restaurant', sushi: 'restaurant', bistro: 'restaurant', laundromat: 'laundry',
  salon: 'salon', phonefix: 'tech', gym: 'gym', karaoke: 'lounge', bikeshop: 'bike', hotel: 'hotel' };

// Fortunes (the fortune teller): text + what happens (cft-fun.js reads `do`)
D.FORTUNES = [
  { t: 'I see... money. On the ground. Quite near.', do: 'coins' }, { t: 'A great bird approaches. It is furious.', do: 'goose' },
  { t: 'Love is in the air. Or pollen. Your charm grows.', do: 'charm' }, { t: 'Beware the wobbling ones tonight.', do: 'slimes' },
  { t: 'The stars say: you are lucky today. Also, hydrate.', do: 'sticker' }, { t: 'Visitors. From very far. Look up.', do: 'ufo' },
  { t: 'You will walk very fast for a while. Don\'t ask why.', do: 'speed' }, { t: 'Your future is... sticky. I see a slide.', do: 'peels' },
];

// What the made-up shops along the streets are. W.makeShop picks by weight; names come from D.shopName.
D.SHOP_MIX = [['cafe', 9], ['restaurant', 8], ['fastfood', 6], ['bakery', 6], ['grocery', 8], ['clothes', 6], ['flowers', 3], ['books', 3], ['tech', 3], ['pharmacy', 3],
  ['salon', 4], ['gym', 2], ['toys', 3], ['gift', 3], ['music', 2], ['pet', 2], ['hardware', 2], ['laundry', 3], ['icecream', 3], ['lounge', 3], ['furniture', 2],
  ['bike', 2], ['jewelry', 1], ['joke', 4], ['fortune', 2], ['bank', 1]];
const NAME_A = ['Happy', 'Lucky', 'Golden', 'Little', 'Big', 'Funky', 'Cosmic', 'Sunny', 'Sleepy', 'Fancy', 'Wobbly', 'Royal', 'Turbo', 'Velvet', 'Crispy', 'Jolly', 'Mighty', 'Purple', 'Disco', 'Humble', 'Sneaky', 'Electric', 'Dizzy', 'Grand'];
const NAME_B = {
  cafe: ['Bean', 'Mug', 'Roast', 'Cup', 'Drip'], restaurant: ['Fork', 'Table', 'Plate', 'Spoon', 'Kitchen'], fastfood: ['Burger', 'Fry', 'Taco', 'Nugget', 'Hot Dog'],
  bakery: ['Crumb', 'Bun', 'Loaf', 'Croissant', 'Oven'], grocery: ['Basket', 'Pantry', 'Market', 'Carrot', 'Corner'], clothes: ['Thread', 'Closet', 'Hanger', 'Sock', 'Button'],
  flowers: ['Petal', 'Tulip', 'Bloom', 'Daisy', 'Stem'], books: ['Page', 'Chapter', 'Bookworm', 'Shelf', 'Comma'], tech: ['Pixel', 'Gizmo', 'Byte', 'Widget', 'Robot'],
  pharmacy: ['Remedy', 'Tonic', 'Plaster', 'Pill'], salon: ['Scissors', 'Curl', 'Comb', 'Fringe'], gym: ['Dumbbell', 'Flex', 'Sweat', 'Burpee'], toys: ['Yo-Yo', 'Teddy', 'Kite', 'Marble'],
  gift: ['Trinket', 'Ribbon', 'Souvenir', 'Knick-Knack'], music: ['Banjo', 'Vinyl', 'Kazoo', 'Chord'], pet: ['Paw', 'Whisker', 'Biscuit', 'Hamster'], hardware: ['Hammer', 'Bolt', 'Wrench', 'Nail'],
  laundry: ['Bubble', 'Suds', 'Sock', 'Spin'], icecream: ['Scoop', 'Sprinkle', 'Cone', 'Sundae'], lounge: ['Owl', 'Groove', 'Neon', 'Flamingo'], furniture: ['Sofa', 'Nest', 'Cushion', 'Lamp'],
  bike: ['Spoke', 'Pedal', 'Wheelie', 'Sprocket'], jewelry: ['Carat', 'Sparkle', 'Gem'], joke: ['Whoopee', 'Giggle', 'Chicken', 'Honk'], fortune: ['Eye', 'Tarot', 'Comet', 'Crystal'], bank: ['Piggy', 'Penny', 'Vault'],
};
D.shopName = function (kind, r) { // r: 0..1, steady for a building
  const k = D.KINDS[kind], n = Math.floor(r * 1000);
  if (n % 3 === 0 && k.fake.length) return k.fake[n % k.fake.length];
  const b = NAME_B[kind] || [k.n];
  return (n % 2 ? 'The ' : '') + NAME_A[n % NAME_A.length] + ' ' + b[Math.floor(n / 7) % b.length];
};
// Sign colours per kind of place (the 3D boards on the buildings)
D.SIGN_COLS = { cafe: '#8a5a3c', restaurant: '#b3261e', fastfood: '#e8590c', bakery: '#c2772b', icecream: '#e64980', lounge: '#5f3dc4', grocery: '#2f9e44', clothes: '#1c7ed6',
  flowers: '#d6336c', books: '#5c4033', library: '#364fc7', tech: '#1f2937', pharmacy: '#0ca678', school: '#e67700', park: '#2b8a3e', cinema: '#862e9c', museum: '#495057',
  clinic: '#0b7285', bank: '#2b3a67', post: '#c92a2a', salon: '#c2255c', bike: '#087f5b', garage: '#5c5f66', community: '#7048e8', gym: '#d9480f', stadium: '#1864ab',
  landmark: '#a67c00', music: '#9c36b5', jewelry: '#0c8599', toys: '#f08c00', pet: '#74b816', furniture: '#846358', gift: '#e03131', hotel: '#3b5bdb', laundry: '#1098ad',
  hardware: '#e8590c', metro: '#1971c2', joke: '#f76707', fortune: '#6741d9' };

// Random things that happen on the street. w = weight, night/day limits, min level.
D.EVENTS = [
  { id: 'moneyrain', n: '💸 A money truck hit a pothole!', sub: 'Coins all over the street. Grab them!', w: 6 },
  { id: 'flashmob', n: '🕺 Flash mob!', sub: 'Everyone is dancing. Join in (E)!', w: 5, day: true },
  { id: 'ufo', n: '🛸 What is THAT?', sub: 'Something is hovering nearby. Stand in the beam!', w: 3 },
  { id: 'goose', n: '🪿 A goose has chosen you.', sub: 'Run, or bonk it. Good luck either way.', w: 4, day: true },
  { id: 'slimes', n: '🟢 Slime alert!', sub: 'A wobble of slimes is loose on the street.', w: 4, day: true },
  { id: 'crate', n: '🪂 Mystery crate incoming!', sub: 'It\'s floating down nearby. Be there when it lands.', w: 5 },
  { id: 'dogs', n: '🐕 You smell like bacon.', sub: 'Every dog on the block wants to be your friend.', w: 3, day: true },
  { id: 'pigeonzilla', n: '🐦 PIGEONZILLA!', sub: 'A very large pigeon is stomping around. It has your coins on its mind.', w: 2, lvl: 3 },
];

// Feats: stickers you can't find, only earn
D.STICKER_SETS.push({ id: 'shenanigans', n: 'Shenanigans', feat: true, bonus: { stats: { cred: 2, charm: 2 } }, bonusText: '+2 Street cred, +2 Charm',
  items: [['bonker', '👾', 'Monster bonker'], ['cardcrown', '🤴', 'Cardboard crown'], ['heartthrob', '💘', 'Heartthrob'], ['prankster', '🤡', 'Prankster'], ['abducted', '🛸', 'Close encounter'], ['goosed', '🪿', 'Goose survivor']] });

D.CHATTER.push('Did you see that slime last night? Wobbly little menace.', 'Somebody put a scarf on a lamp post. Respect.', 'A goose chased me for three blocks. THREE.',
  'The joke shop sells rubber chickens. Just so you know.', 'I saw a UFO over the bakery. Nobody believes me.', 'Never trust a traffic cone at night.',
  'The street folk say there\'s a crown going around.', 'Those traffic lights take forever, eh?', 'Banana peels everywhere. Somebody loves chaos.');

// More side stories (chapter 10). Step "count": a counter rises by n (or, with abs, reaches n): bonks, helped, flirts,
// escapes, slides, bounces, ufos, boss, sweet (sweethearts right now), crowned, weapons (owned).
S('s-armed', 'Armed and Ridiculous', 'dmitri', 'garage', { m: ['c1-couch'] }, ['Dmitri: The night streets? Full of wobbly things that steal coins. You need protection.',
  'Dmitri: Not a real weapon! This is a nice neighbourhood. A baguette. A rubber chicken. Something with dignity.'],
  [{ do: 'count', key: 'weapons', abs: true, n: 1, text: 'Buy something silly to bonk with (bakeries sell baguettes 🥖)' }, { do: 'count', key: 'bonks', n: 2, text: 'Bonk 2 monsters with it (press F). They come out after dark 🌙' }],
  ['Dmitri: Ha! A warrior. A very silly warrior.'], { money: 60, xp: 160, stats: { cred: 0.5 }, rel: { dmitri: 8 } });
S('s-night-shift', 'Night Shift', 'bouchard', 'community', { m: ['s-armed'] }, ['Bouchard: Officially, monsters do not exist. Unofficially, one ate my donut.',
  'Bouchard: Clear five of them off my beat and I never saw you carrying that baguette.'],
  [{ do: 'count', key: 'bonks', n: 5, text: 'Bonk 5 monsters 👾' }], ['Bouchard: The streets are safe. The donuts are safe. Good work, citizen.'], { money: 110, xp: 260, stats: { cred: 1 }, rel: { bouchard: 12 } });
S('s-king-blob', 'Long Wobble the King', 'bouchard', 'community', { m: ['s-night-shift'], lvl: 4 }, ['Bouchard: There is a big one. Purple. Wears a crown. Calls itself King Blob.',
  'Bouchard: It only comes out in the dead of night. Bring your best bonking stick.'],
  [{ do: 'count', key: 'boss', n: 1, text: 'Find and bonk King Blob (after 22:00) 👑' }], ['Bouchard: You dethroned a jelly. I am putting that in the report.'], { money: 300, xp: 500, stats: { cred: 2 }, sticker: 'trophy' });
S('s-soup', 'The Street Remembers', 'rosa', 'bakery', { m: ['c1-rosa'] }, ['Rosa: You see the people on the corners, yes? Marcel, Dolores, the Captain? They are neighbours too.',
  'Rosa: A coin, a sandwich, five minutes of listening. Help three of them. This is how a street stays a street.'],
  [{ do: 'count', key: 'helped', n: 3, text: 'Help 3 street folk: a coin, some food or a listening ear 🧡' }], ['Rosa: Good. You have a heart. I was almost sure.'], { xp: 200, happy: 8, stats: { charm: 1 }, rel: { rosa: 10 } });
S('s-crown', 'A Crown of Cardboard', 'grandpa', 'park', { m: ['s-soup'] }, ['Walt: In my mail-carrying days the street folk had a king. Chosen by them. Crown made from a pizza box.',
  'Walt: The throne has been empty for years. They are waiting for somebody kind. Could be you.'],
  [{ do: 'count', key: 'crowned', abs: true, n: 1, text: 'Earn 40 street hearts and be crowned 👑' }], ['Walt: Your Majesty. I would bow, but my knees have retired.'], { money: 250, xp: 600, happy: 10, stats: { cred: 2, charm: 2 } });
S('s-smooth', 'Smooth Operator', 'zoe', 'lounge', { lvl: 3 }, ['Zoe: You have rhythm in your feet but none in your mouth. Go flirt with three strangers.',
  'Zoe: Worst case, they laugh. Best case, they laugh AND give you their number.'],
  [{ do: 'count', key: 'flirts', n: 3, text: 'Charm 3 strangers (E on a person, then Flirt 😘)' }], ['Zoe: Look at you. A menace to hearts everywhere.'], { xp: 220, stats: { charm: 1.5 }, rel: { zoe: 8 } });
S('s-heartthrob', 'Heartthrob', 'noor', 'museum', { m: ['s-smooth'] }, ['Noor: I am doing a photo series: "People Who Are Somehow Dating Half the Street". I need a model.',
  'Noor: Three sweethearts at the same time. And {name}: do NOT let them meet.'],
  [{ do: 'count', key: 'sweet', abs: true, n: 3, text: 'Have 3 sweethearts at the same time 💕' }], ['Noor: Got the shot. Also: I give this two weeks before the drama.'], { money: 120, xp: 300, stats: { charm: 1, style: 1 }, rel: { noor: 8 } });
S('s-prank-war', 'Prank War', 'jay', 'tech', { lvl: 3 }, ['Jay: I have a theory: no shopkeeper in this town can outrun you. Science demands a test.',
  'Jay: Made-up shops only. The real ones have lawyers.'],
  [{ do: 'count', key: 'escapes', n: 2, text: 'Prank 2 made-up shops and outrun the owners 🤡' }], ['Jay: Two for two. The theory holds. You are a menace and I respect it.'], { money: 100, xp: 240, stats: { cred: 1 }, rel: { jay: 8 } });
S('s-banana', 'Slip and Slide', 'kai', 'park', { m: ['c1-couch'] }, ['Kai: Dude. Somebody left banana peels all over town. You know what that means? FREE SPEED.',
  'Kai: Hit three peels at a run. Then find something bouncy: a trampoline, a parked car roof, whatever.'],
  [{ do: 'count', key: 'slides', n: 3, text: 'Slide on 3 banana peels 🍌' }, { do: 'count', key: 'bounces', n: 2, text: 'Bounce twice: trampolines or parked car roofs (jump on them) 🤸' }],
  ['Kai: Gnarly. You\'re basically a cartoon now.'], { xp: 180, stats: { fit: 0.5, cred: 0.5 }, rel: { kai: 8 } });
S('s-ufo', 'Close Encounter', 'okafor', 'library', { lvl: 4 }, ['Okafor: I have catalogued forty-one sightings of a hovering object over this neighbourhood. Forty-one!',
  'Okafor: Stand in its light beam and tell me what happens. For science. I will hold your library card.'],
  [{ do: 'count', key: 'ufos', n: 1, text: 'Find the UFO and stand in its beam 🛸 (it shows up while you wander)' }], ['Okafor: It gave you a GEM? Fascinating. Forty-two.'], { money: 150, xp: 350, stats: { smarts: 1 }, rel: { okafor: 10 } });

// ================================================================================================ the long game
// Progression after World of Warcraft (cft-rpg.js runs it): loot in rarity colours, talents, reputation with five
// neighbourhood factions, achievements and titles, rested XP, discovery XP and rare monsters.
D.RPG = {
  BAG: 30, SLOTS: ['c1', 'c2', 'c3'], TIER_COST: 3, PITY: 25,
  // rarity: name, colour (on light backgrounds), budget multiplier, drop weight
  QUALITY: [
    { n: 'Junk', c: '#8a8a8a', k: 0, w: 30 }, { n: 'Common', c: '#4b4f5c', k: 1, w: 33 }, { n: 'Uncommon', c: '#1a9e2a', k: 1.35, w: 26 },
    { n: 'Rare', c: '#0a6fd6', k: 1.8, w: 8.5 }, { n: 'Epic', c: '#9b3de0', k: 2.5, w: 2.2 }, { n: 'Legendary', c: '#e0700a', k: 3.6, w: 0.3 },
  ],
  // where loot comes from: chance of a drop, lowest quality
  SOURCES: { monster: { chance: 0.22, minQ: 0 }, pigeon: { chance: 1, minQ: 2 }, rare: { chance: 1, minQ: 3 }, boss: { chance: 1, minQ: 4 },
    chest: { chance: 1, minQ: 1 }, crate: { chance: 1, minQ: 2 }, quest: { chance: 1, minQ: 2 } },
  JUNK: [['🧾', 'Soggy receipt'], ['🥨', 'Half a pretzel'], ['🥄', 'Bent spoon'], ['🪶', 'Grey pigeon feather'], ['🎟️', 'Expired coupon'], ['🎧', 'One earbud'],
    ['🗝️', 'Key to nothing'], ['🧦', 'A single sock'], ['🥤', 'Empty can'], ['🔩', 'Mystery bolt'], ['🧻', 'Napkin with a phone number'], ['🍬', 'Linty candy']],
  CHARMS: [['🧢', 'Bottle Cap'], ['🦆', 'Rubber Duck'], ['🎲', 'Lucky Die'], ['🪙', 'Subway Token'], ['📼', 'Mixtape'], ['🧿', 'Evil-Eye Bead'], ['🔑', 'Brass Keychain'],
    ['🥠', 'Fortune Cookie'], ['🪀', 'Yo-Yo'], ['🌟', 'Glow Stick'], ['🍀', 'Four-Leaf Clover'], ['🐚', 'Seashell'], ['🧸', 'Pocket Bear'], ['📿', 'Friendship Bracelet'],
    ['🔮', 'Snow Globe'], ['🪃', 'Boomerang'], ['🧲', 'Fridge Magnet'], ['🎫', 'Golden Ticket'], ['🪅', 'Tiny Piñata'], ['🕹️', 'Arcade Joystick']],
  SUFFIX: { fit: 'of the Sprinter', charm: 'of the Charmer', smarts: 'of the Hustler', style: 'of Swagger', cred: 'of the Streets' },
  ADJ: ['Shiny', 'Polished', 'Glittering', 'Well-Loved', 'Humming', 'Gleaming', 'Suspicious', 'Vintage'],
  LEGEND_ADJ: ['Golden', 'Legendary', 'Cosmic', 'Eternal', 'Thunderous', 'Mythic', 'Radiant'],
  // epic and legendary items carry one perk (legendary: 1.6x)
  PERKS: [{ k: 'xp', v: 0.06, d: '+{p}% XP' }, { k: 'coin', v: 0.1, d: '+{p}% money from coins' }, { k: 'speed', v: 0.04, d: '+{p}% speed' },
    { k: 'dmg', v: 0.15, d: '+{p}% bonk damage' }, { k: 'loot', v: 0.15, d: '+{p}% loot chance' }, { k: 'income', v: 0.06, d: '+{p}% business income' },
    { k: 'crit', v: 0.06, d: '+{p}% critical bonks' }, { k: 'happy', v: 4, d: '+{n} happiness', flat: true }],
  // talents: a point every level from 2. A tier opens after TIER_COST points in that branch.
  BRANCHES: [{ id: 'hustle', n: 'Hustler', e: '💼', blurb: 'Money, business and loot.' }, { id: 'charm', n: 'Charmer', e: '💬', blurb: 'People, love and the street.' },
    { id: 'brawl', n: 'Brawler', e: '👊', blurb: 'Monsters, speed and bonking.' }],
  TALENTS: [
    { id: 'pinch', b: 'hustle', tier: 1, max: 3, e: '🪙', n: 'Penny Pincher', d: '+{4}% money from coins', fx: { coin: 0.04 } },
    { id: 'haggle', b: 'hustle', tier: 1, max: 2, e: '🏷️', n: 'Haggler', d: 'Shops are {3}% cheaper', fx: { discount: 0.03 } },
    { id: 'side', b: 'hustle', tier: 2, max: 3, e: '📈', n: 'Side Hustle', d: 'Businesses earn {5}% more', fx: { income: 0.05 } },
    { id: 'study', b: 'hustle', tier: 2, max: 2, e: '📚', n: 'Quick Study', d: '+{5}% XP from everything', fx: { xp: 0.05 } },
    { id: 'nose', b: 'hustle', tier: 3, max: 2, e: '👃', n: 'Treasure Nose', d: '+{10}% loot chance', fx: { loot: 0.1 } },
    { id: 'invest', b: 'hustle', tier: 3, max: 2, e: '🏦', n: 'Investor', d: 'Savings earn +{0.5}% a day', fx: { interest: 0.005 } },
    { id: 'shark', b: 'hustle', tier: 4, max: 2, e: '🦈', n: 'Deal Shark', d: 'Loot sells for {25}% more', fx: { sell: 0.25 } },
    { id: 'mogul', b: 'hustle', tier: 5, max: 1, e: '🎩', n: 'Mogul', d: 'Everything 10% cheaper, businesses +10%, turf +20%', fx: { discount: 0.1, income: 0.1, turf: 0.2, cap: 1 } },
    { id: 'smooth', b: 'charm', tier: 1, max: 3, e: '😎', n: 'Smooth Talker', d: '+{0.5} Charm', fx: { stat_charm: 0.5 } },
    { id: 'dress', b: 'charm', tier: 1, max: 2, e: '👔', n: 'Sharp Dresser', d: '+{0.5} Style', fx: { stat_style: 0.5 } },
    { id: 'neighbour', b: 'charm', tier: 2, max: 3, e: '🏘️', n: 'Good Neighbour', d: 'Reputation gains +{10}%', fx: { rep: 0.1 } },
    { id: 'magnet', b: 'charm', tier: 2, max: 2, e: '🧲', n: 'Magnetic', d: 'Pick-up lines land {6}% more often', fx: { flirt: 0.06 } },
    { id: 'party', b: 'charm', tier: 3, max: 2, e: '🎉', n: 'Life of the Party', d: '+{3} happiness', fx: { happy: 3 } },
    { id: 'heart', b: 'charm', tier: 3, max: 1, e: '💞', n: 'Heartkeeper', d: 'Sweethearts miss you half as fast', fx: { fade: 1 } },
    { id: 'tongue', b: 'charm', tier: 4, max: 1, e: '👅', n: 'Silver Tongue', d: 'Pranks cost no reputation; bans last one day', fx: { forgive: 1 } },
    { id: 'icon', b: 'charm', tier: 5, max: 1, e: '🌟', n: 'Local Icon', d: '+3 Charm and Style; fans tip you on the street', fx: { stat_charm: 3, stat_style: 3, tips: 1, cap: 1 } },
    { id: 'hands', b: 'brawl', tier: 1, max: 3, e: '🥊', n: 'Heavy Hands', d: 'Bonks hit {10}% harder', fx: { dmg: 0.1 } },
    { id: 'feet', b: 'brawl', tier: 1, max: 3, e: '👟', n: 'Fleet Feet', d: '+{2}% speed', fx: { speed: 0.02 } },
    { id: 'wallet', b: 'brawl', tier: 2, max: 2, e: '👛', n: 'Iron Wallet', d: 'Monsters grab {25}% fewer coins', fx: { steal: 0.25 } },
    { id: 'scav', b: 'brawl', tier: 2, max: 2, e: '🦝', n: 'Scavenger', d: '+{10}% loot chance', fx: { loot: 0.1 } },
    { id: 'wind', b: 'brawl', tier: 3, max: 1, e: '💨', n: 'Second Wind', d: 'Sprinting uses 30% less energy', fx: { drain: 0.3 } },
    { id: 'bounty', b: 'brawl', tier: 3, max: 2, e: '💰', n: 'Bounty Hunter', d: '+{15}% XP from monsters', fx: { monsterXp: 0.15 } },
    { id: 'crit', b: 'brawl', tier: 4, max: 2, e: '💥', n: 'Critical Bonk', d: '{10}% chance to bonk for double', fx: { crit: 0.1 } },
    { id: 'legend', b: 'brawl', tier: 5, max: 1, e: '🌙', n: 'Legend of the Night', d: 'Rare monsters appear twice as often and drop Epic or better', fx: { rare: 1, cap: 1 } },
  ],
  // reputation: five neighbourhood factions. gain = points per counter step (negative = you lose standing).
  TIERS: [['Neutral', 0], ['Friendly', 600], ['Honored', 1800], ['Revered', 4200], ['Exalted', 8400]],
  FACTIONS: [
    { id: 'shops', n: 'Shopkeepers\' Guild', e: '🏪', d: 'Spend money, run errands and odd jobs. Pranks make them cross.', gain: { spent: 0.6, jobs: 60, rush: 40, pranks: -150 },
      rewards: [null, { d: 'Shops 5% cheaper', fx: { discount: 0.05 } }, { d: 'An Epic charm: the Shopkeepers\' Ledger', item: { e: '📒', n: 'Shopkeepers\' Ledger', q: 4, focus: 'smarts', second: 'style', perk: 'income' } },
        { d: 'Businesses earn 10% more', fx: { income: 0.1 } }, { d: 'Title "the Best Customer" + a Legendary charm', title: 'the Best Customer', item: { e: '🛒', n: 'Golden Shopping Cart', q: 5, focus: 'smarts', second: 'style', perk: 'coin' } }] },
    { id: 'watch', n: 'The Night Watch', e: '🔦', d: 'Bonk the monsters that come out after dark.', gain: { bonks: 12, rares: 150, boss: 300 },
      rewards: [null, { d: 'Bonks hit 10% harder', fx: { dmg: 0.1 } }, { d: 'An Epic charm: the Night Watch Lantern', item: { e: '🏮', n: 'Night Watch Lantern', q: 4, focus: 'cred', second: 'fit', perk: 'dmg' } },
        { d: 'Monsters grab 50% fewer coins', fx: { steal: 0.5 } }, { d: 'Title "of the Night Watch" + a Legendary charm', title: 'of the Night Watch', item: { e: '🔦', n: 'Torch of the Last Patrol', q: 5, focus: 'cred', second: 'fit', perk: 'crit' } }] },
    { id: 'folk', n: 'The Street Folk', e: '🧡', d: 'Help the neighbours on the corners: a coin, food, five minutes.', gain: { helped: 35, crowned: 600 },
      rewards: [null, { d: '+4 happiness', fx: { happy: 4 } }, { d: 'An Epic charm: Mags\' Knitted Scarf', item: { e: '🧣', n: 'Mags\' Knitted Scarf', q: 4, focus: 'charm', second: 'cred', perk: 'happy' } },
        { d: '+15% loot chance (they point out shiny things)', fx: { loot: 0.15 } }, { d: 'Title "the Kind" + a Legendary charm', title: 'the Kind', item: { e: '🦯', n: 'Cardboard Sceptre', q: 5, focus: 'charm', second: 'cred', perk: 'xp' } }] },
    { id: 'hearts', n: 'The Hearts Club', e: '💘', d: 'Flirt, date, tell jokes. Drama costs you.', gain: { flirts: 45, dates: 90, jokes: 12, dramas: -60 },
      rewards: [null, { d: '+1 Charm', fx: { stat_charm: 1 } }, { d: 'An Epic charm: the Love Letter', item: { e: '💌', n: 'Love Letter', q: 4, focus: 'charm', second: 'style', perk: 'happy' } },
        { d: 'Pick-up lines land 10% more often', fx: { flirt: 0.1 } }, { d: 'Title "the Heartthrob" + a Legendary charm', title: 'the Heartthrob', item: { e: '💍', n: 'Ring of a Thousand Winks', q: 5, focus: 'charm', second: 'style', perk: 'speed' } }] },
    { id: 'crews', n: 'The Street Crews', e: '🎨', d: 'Tag posters, win races, defend blocks, outrun shopkeepers.', gain: { tags: 25, races: 70, defends: 90, escapes: 35, slides: 8, bounces: 6 },
      rewards: [null, { d: '+3% speed', fx: { speed: 0.03 } }, { d: 'An Epic charm: the Crew Jacket Patch', item: { e: '🧷', n: 'Crew Jacket Patch', q: 4, focus: 'cred', second: 'style', perk: 'speed' } },
        { d: 'Blocks pay 15% more', fx: { turf: 0.15 } }, { d: 'Title "Boss of the Blocks" + a Legendary charm', title: 'Boss of the Blocks', item: { e: '🛹', n: 'Deck of the Original Skater', q: 5, focus: 'fit', second: 'cred', perk: 'loot' } }] },
  ],
  // named rare monsters (a silver name tag): tougher, worth a lot, guaranteed Rare loot
  RARES: [{ kind: 'bin', n: 'Gutterbeard the Bin King' }, { kind: 'slime', n: 'Countess Slimeula' }, { kind: 'cone', n: 'Sir Conesworth III' },
    { kind: 'sock', n: 'The Odd Sock' }, { kind: 'slime', n: 'Wobblor the Unwobbled' }, { kind: 'pigeon', n: 'Big Kevin' }, { kind: 'bin', n: 'Lady Recyclia' }, { kind: 'cone', n: 'Detour Dave' }],
  // achievements: k = what is counted (a counter, or a special: level, streets, blocks, missions, worth, biz, turfs, married, kids,
  // friends, sweet, sets, exalted, capstone, rarenames, legendary), n = how many, pts, title (optional)
  ACH: [
    { id: 'lv5', cat: 'Growing up', e: '⭐', n: 'Getting the Hang of It', d: 'Reach level 5', k: 'level', c: 5, pts: 10 },
    { id: 'lv10', cat: 'Growing up', e: '⭐', n: 'Local', d: 'Reach level 10', k: 'level', c: 10, pts: 10 },
    { id: 'lv20', cat: 'Growing up', e: '🌟', n: 'Somebody Around Here', d: 'Reach level 20', k: 'level', c: 20, pts: 25 },
    { id: 'lv30', cat: 'Growing up', e: '💫', n: 'Pillar of the Community', d: 'Reach level 30', k: 'level', c: 30, pts: 50, title: 'the Seasoned' },
    { id: 'st10', cat: 'Exploration', e: '🧭', n: 'Stretching Your Legs', d: 'Discover 10 streets', k: 'streets', c: 10, pts: 10 },
    { id: 'st50', cat: 'Exploration', e: '🧭', n: 'Street Smart', d: 'Discover 50 streets', k: 'streets', c: 50, pts: 10 },
    { id: 'st150', cat: 'Exploration', e: '🗺️', n: 'Walking Map', d: 'Discover 150 streets', k: 'streets', c: 150, pts: 25, title: 'the Explorer' },
    { id: 'st400', cat: 'Exploration', e: '🌍', n: 'Every Corner', d: 'Discover 400 streets', k: 'streets', c: 400, pts: 50, title: 'the Wanderer' },
    { id: 'bl10', cat: 'Exploration', e: '🏙️', n: 'New Neighbourhoods', d: 'Discover 10 blocks', k: 'blocks', c: 10, pts: 10 },
    { id: 'bl40', cat: 'Exploration', e: '🏙️', n: 'All Over Town', d: 'Discover 40 blocks', k: 'blocks', c: 40, pts: 25 },
    { id: 'ch10', cat: 'Exploration', e: '🧰', n: 'Treasure Hunter', d: 'Open 10 treasure chests', k: 'chests', c: 10, pts: 10 },
    { id: 'm1', cat: 'Monsters', e: '👾', n: 'First Bonk', d: 'Bonk a monster', k: 'bonks', c: 1, pts: 10 },
    { id: 'm25', cat: 'Monsters', e: '👾', n: 'Pest Control', d: 'Bonk 25 monsters', k: 'bonks', c: 25, pts: 10 },
    { id: 'm100', cat: 'Monsters', e: '🗡️', n: 'Monster Hunter', d: 'Bonk 100 monsters', k: 'bonks', c: 100, pts: 25, title: 'the Monster Hunter' },
    { id: 'm500', cat: 'Monsters', e: '⚔️', n: 'The Night Belongs to You', d: 'Bonk 500 monsters', k: 'bonks', c: 500, pts: 50, title: 'the Unbonkable' },
    { id: 'r1', cat: 'Monsters', e: '💀', n: 'Rare Sighting', d: 'Bonk a rare monster', k: 'rares', c: 1, pts: 10 },
    { id: 'rall', cat: 'Monsters', e: '💀', n: 'Rare Collector', d: 'Bonk every one of the 8 rare monsters', k: 'rarenames', c: 8, pts: 50, title: 'the Rare Collector' },
    { id: 'boss', cat: 'Monsters', e: '👑', n: 'Long Wobble the King', d: 'Bonk King Blob', k: 'boss', c: 1, pts: 25, title: 'the Blob Slayer' },
    { id: 'l3', cat: 'Loot', e: '🔷', n: 'Ooh, Blue!', d: 'Find a Rare item', k: 'loot_3', c: 1, pts: 10 },
    { id: 'l4', cat: 'Loot', e: '🟣', n: 'Purple Is the Best Colour', d: 'Find an Epic item', k: 'loot_4', c: 1, pts: 25 },
    { id: 'l5', cat: 'Loot', e: '🟠', n: 'Legendary!', d: 'Find a Legendary item', k: 'loot_5', c: 1, pts: 50, title: 'the Lucky' },
    { id: 'l100', cat: 'Loot', e: '🎒', n: 'Pockets Full', d: 'Loot 100 items', k: 'loot', c: 100, pts: 25 },
    { id: 'junk', cat: 'Loot', e: '🧾', n: 'One Person\'s Trash', d: 'Sell 50 pieces of junk', k: 'junksold', c: 50, pts: 10 },
    { id: 'f1', cat: 'People', e: '😘', n: 'Smooth', d: 'Charm a stranger', k: 'flirts', c: 1, pts: 10 },
    { id: 'f5', cat: 'People', e: '💕', n: 'Popular', d: 'Have 5 sweethearts at once', k: 'sweet', c: 5, pts: 25, title: 'the Irresistible' },
    { id: 'd10', cat: 'People', e: '🌹', n: 'Hopeless Romantic', d: 'Go on 10 dates', k: 'dates', c: 10, pts: 25 },
    { id: 'j10', cat: 'People', e: '🤡', n: 'Stand-Up', d: 'Tell 10 jokes', k: 'jokes', c: 10, pts: 10, title: 'the Comedian' },
    { id: 'h10', cat: 'People', e: '🧡', n: 'Good Egg', d: 'Help street folk 10 times', k: 'helped', c: 10, pts: 10 },
    { id: 'crown', cat: 'People', e: '👑', n: 'Long Live the Monarch', d: 'Be crowned by the street folk', k: 'crowned', c: 1, pts: 50 },
    { id: 'fr10', cat: 'People', e: '🤝', n: 'Everybody Knows Your Name', d: 'Make 10 friends', k: 'friends', c: 10, pts: 25 },
    { id: 'wed', cat: 'People', e: '💒', n: 'Happily Ever After', d: 'Get married', k: 'married', c: 1, pts: 25 },
    { id: 'p5', cat: 'Shenanigans', e: '🤡', n: 'Prankster', d: 'Pull 5 pranks', k: 'pranks', c: 5, pts: 10, title: 'the Menace' },
    { id: 'e10', cat: 'Shenanigans', e: '🏃', n: 'Can\'t Catch Me', d: 'Outrun 10 angry shopkeepers', k: 'escapes', c: 10, pts: 25 },
    { id: 'sl25', cat: 'Shenanigans', e: '🍌', n: 'Slippery', d: 'Slide on 25 banana peels', k: 'slides', c: 25, pts: 10 },
    { id: 'bo25', cat: 'Shenanigans', e: '🤸', n: 'Boing Boing', d: 'Bounce 25 times', k: 'bounces', c: 25, pts: 10 },
    { id: 'ufo', cat: 'Shenanigans', e: '🛸', n: 'They Came in Peace', d: 'Stand in a UFO\'s beam', k: 'ufos', c: 1, pts: 10 },
    { id: 'ev25', cat: 'Shenanigans', e: '🎪', n: 'Never a Dull Day', d: 'See 25 street events', k: 'events', c: 25, pts: 10 },
    { id: 'q25', cat: 'Story', e: '📜', n: 'Helpful', d: 'Finish 25 missions', k: 'missions', c: 25, pts: 10 },
    { id: 'q85', cat: 'Story', e: '📜', n: 'Pillar of the Plateau', d: 'Finish 85 missions', k: 'missions', c: 85, pts: 25 },
    { id: 'q165', cat: 'Story', e: '🏅', n: 'Completionist', d: 'Finish all 165 missions', k: 'missions', c: 165, pts: 50, title: 'the Completionist' },
    { id: 'b1', cat: 'Business', e: '🍋', n: 'Open for Business', d: 'Open a business', k: 'biz', c: 1, pts: 10 },
    { id: 'b15', cat: 'Business', e: '🏨', n: 'Mogul', d: 'Own all 15 businesses', k: 'biz', c: 15, pts: 50, title: 'the Mogul' },
    { id: 't10', cat: 'Business', e: '🎨', n: 'Turf Lord', d: 'Own 10 blocks', k: 'turfs', c: 10, pts: 25, title: 'the Turf Lord' },
    { id: 'w100k', cat: 'Business', e: '💰', n: 'Six Figures', d: 'Reach a net worth of $100,000', k: 'worth', c: 100000, pts: 25, title: 'the Tycoon' },
    { id: 'rep1', cat: 'Reputation', e: '🤝', n: 'Well Liked', d: 'Reach Honored with a faction', k: 'honored', c: 1, pts: 10 },
    { id: 'ex1', cat: 'Reputation', e: '🏆', n: 'Exalted', d: 'Reach Exalted with a faction', k: 'exalted', c: 1, pts: 25 },
    { id: 'ex5', cat: 'Reputation', e: '👑', n: 'Loved by All', d: 'Reach Exalted with all five factions', k: 'exalted', c: 5, pts: 50, title: 'the Exalted' },
    { id: 'tal', cat: 'Growing up', e: '🌳', n: 'Specialist', d: 'Learn a final-tier talent', k: 'capstone', c: 1, pts: 25 },
    { id: 'rest', cat: 'Growing up', e: '💤', n: 'Well Rested', d: 'Earn 1,000 bonus XP from being rested', k: 'restedxp', c: 1000, pts: 10 },
    { id: 'sets7', cat: 'Growing up', e: '🎴', n: 'Collector', d: 'Complete 7 sticker sets', k: 'sets', c: 7, pts: 25 },
  ],
};
D.PICKUPS.chest = { e: '🧰', n: 'Treasure chest', bg: '#ffd27a', w: 0, loot: true, beam: true };
D.CHATTER.push('Did you see that silver-tagged monster? Folks say it drops the good stuff.', 'Have a nap at home now and then. You come back sharper.',
  'My cousin found a purple charm under a bench. PURPLE.', 'The Night Watch is recruiting, apparently.');

// Gear you can see on yourself (Diablo-style loot): bases per slot, armour per slot, colours by quality
Object.assign(D.RPG, {
  SLOT_NAMES: { weapon: 'Weapon', head: 'Head', body: 'Body', feet: 'Feet', c1: 'Charm', c2: 'Charm', c3: 'Charm' },
  GEAR: {
    weapon: [{ id: 'w_baguette', n: 'Baguette' }, { id: 'w_chicken', n: 'Rubber Chicken' }, { id: 'w_pillow', n: 'Pillow' }, { id: 'w_noodle', n: 'Pool Noodle' },
      { id: 'w_fish', n: 'Frozen Fish' }, { id: 'w_plunger', n: 'Plunger' }, { id: 'w_guitar', n: 'Guitar' }],
    head: [{ id: 'cap', n: 'Ball Cap', e: '🧢', look: 'hat' }, { id: 'beanie', n: 'Beanie', e: '🧶', look: 'beanie' }, { id: 'helmet', n: 'Bike Helmet', e: '⛑️', look: 'hat' },
      { id: 'bucket', n: 'Bucket Hat', e: '👒', look: 'hat' }, { id: 'hardhat', n: 'Hard Hat', e: '👷', look: 'hat' }],
    body: [{ id: 'hoodie', n: 'Hoodie', e: '🧥', look: {} }, { id: 'denim', n: 'Denim Jacket', e: '🧥', look: { collar: true } }, { id: 'leather', n: 'Leather Jacket', e: '🧥', look: { collar: true } },
      { id: 'puffer', n: 'Puffer Coat', e: '🧥', look: { coat: true } }, { id: 'trench', n: 'Trench Coat', e: '🧥', look: { coat: true, collar: true } }, { id: 'track', n: 'Track Jacket', e: '🥋', look: { stripes: true } }],
    feet: [{ id: 'sneakers', n: 'Sneakers', e: '👟' }, { id: 'hightops', n: 'High-Tops', e: '👟' }, { id: 'boots', n: 'Work Boots', e: '🥾' }, { id: 'runners', n: 'Running Shoes', e: '👟' }, { id: 'rain', n: 'Rain Boots', e: '🥾' }],
  },
  GEAR_AR: { head: 2, body: 4, feet: 1 },
  GEAR_COLS: [[0x8a8a8a], [0x6b7280, 0x2b4c7e, 0x5b4636, 0x1f2937, 0x9aa3ad], [0x2f9e44, 0x3aa6b9, 0xe8453c, 0xf2b134, 0x6d8b3a], [0x0a6fd6, 0x1c7ed6, 0x3b5bdb, 0x15aabf],
    [0x9b3de0, 0x7b2fbe, 0xb05cff, 0xd6336c], [0xe0700a, 0xf2b134, 0xffcc33, 0xff8a1a]],
  PREFIX: ['Sturdy', 'Reinforced', 'Swift', 'Fierce', 'Glowing', 'Fresh', 'Gilded', 'Battle-Worn', 'Lucky', 'Neon'],
});
// healing (Q or the 🍵 button eats the best one in your bag; food heals too)
Object.assign(D.ITEMS, {
  tea: { n: 'Calm tea', e: '🍵', p: 6, type: 'snack', energy: 10, heal: 40 },
  juice: { n: 'Juice box', e: '🧃', p: 4, type: 'snack', energy: 8, heal: 25 },
  smoothie: { n: 'Blueberry smoothie', e: '🫐', p: 15, type: 'snack', energy: 20, heal: 80 },
});
D.ITEMS.bandage.heal = 30;
D.KINDS.cafe.sells.push('tea', 'smoothie');
D.KINDS.grocery.sells.push('juice', 'tea');
D.KINDS.pharmacy.sells.push('tea');
D.PICKUPS.wallet = { e: '👛', n: 'Your dropped wallet', bg: '#ffd54a', w: 0, wallet: true, beam: true };
D.TIPS.push('Your health is the red bar. Food and calm tea 🍵 heal (Q). Every metro entrance has a guardian: beat it and the station opens.',
  'Figments get tougher the further you roam from home. Home is always calm.',
  'Loot hats, jackets, shoes and weapons show on your character. Phone → Character to swap them.');
D.CHATTER.push('Big thing by the metro last night. Swear I heard it roar.', 'You look tired. Get some sleep, friend.');
S('s-static', 'The Static', 'max', 'home', { m: ['c1-couch'] }, ['Max: Hey cuz... you okay? I saw you swatting at the air out there like it owed you money.',
  'Max: New city, no sleep, a million noises. My first month here my brain did weird stuff too. You\'re not the only one.',
  'Max: Whatever you\'re seeing, face it. Then let\'s get you checked out and get some proper sleep.'],
  [{ do: 'count', key: 'bonks', n: 3, text: 'Face 3 figments (press F)' }, { do: 'buy', item: 'checkup', text: 'Get a free check-up at a clinic 🩺' }, { do: 'sleep', text: 'Get a good night\'s sleep at home 😴' }],
  ['Max: Better? Good. They might come back now and then, when the city gets loud. Friends, sleep and a good mood keep them quiet. And you can always talk to me.'],
  { money: 50, xp: 220, happy: 10, rel: { max: 10 } });

window.CFT_DATA = D;
})();
