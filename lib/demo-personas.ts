/** Realistic synthetic personas for demo seed — no "demo" in names, emails, or streets. */

export const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'Michael', 'Jennifer', 'William', 'Linda',
  'David', 'Elizabeth', 'Richard', 'Barbara', 'Joseph', 'Susan', 'Thomas', 'Jessica',
  'Christopher', 'Sarah', 'Charles', 'Karen', 'Daniel', 'Lisa', 'Matthew', 'Nancy',
  'Anthony', 'Betty', 'Mark', 'Margaret', 'Donald', 'Sandra', 'Steven', 'Ashley',
  'Paul', 'Kimberly', 'Andrew', 'Emily', 'Joshua', 'Donna', 'Kenneth', 'Michelle',
  'Kevin', 'Carol', 'Brian', 'Amanda', 'George', 'Melissa', 'Timothy', 'Deborah',
  'Ronald', 'Stephanie', 'Edward', 'Rebecca', 'Jason', 'Sharon', 'Jeffrey', 'Laura',
  'Ryan', 'Cynthia', 'Jacob', 'Kathleen', 'Gary', 'Amy', 'Nicholas', 'Angela',
  'Eric', 'Shirley', 'Jonathan', 'Anna', 'Stephen', 'Brenda', 'Larry', 'Pamela',
  'Justin', 'Emma', 'Scott', 'Nicole', 'Brandon', 'Helen', 'Benjamin', 'Samantha',
  'Samuel', 'Katherine', 'Gregory', 'Christine', 'Frank', 'Debra', 'Alexander', 'Rachel',
  'Raymond', 'Carolyn', 'Patrick', 'Janet', 'Jack', 'Catherine', 'Dennis', 'Maria',
  'Jerry', 'Heather', 'Tyler', 'Diane', 'Aaron', 'Ruth', 'Jose', 'Julie',
  'Henry', 'Olivia', 'Adam', 'Joyce', 'Douglas', 'Virginia', 'Nathan', 'Victoria',
  'Zachary', 'Kelly', 'Peter', 'Lauren', 'Kyle', 'Christina', 'Noah', 'Joan',
  'Ethan', 'Evelyn', 'Jeremy', 'Judith', 'Walter', 'Megan', 'Christian', 'Andrea',
  'Keith', 'Hannah', 'Roger', 'Jacqueline', 'Terry', 'Martha', 'Austin', 'Gloria',
  'Sean', 'Teresa', 'Gerald', 'Ann', 'Carl', 'Sara', 'Harold', 'Madison',
  'Dylan', 'Frances', 'Arthur', 'Kathryn', 'Lawrence', 'Janice', 'Jordan', 'Jean',
  'Jesse', 'Abigail', 'Bryan', 'Alice', 'Billy', 'Julia', 'Bruce', 'Judy',
  'Gabriel', 'Sophia', 'Joe', 'Grace', 'Logan', 'Denise', 'Alan', 'Amber',
  'Juan', 'Doris', 'Wayne', 'Marilyn', 'Roy', 'Danielle', 'Ralph', 'Beverly',
  'Randy', 'Isabella', 'Eugene', 'Theresa', 'Vincent', 'Diana', 'Russell', 'Natalie',
  'Louis', 'Brittany', 'Philip', 'Charlotte', 'Bobby', 'Marie', 'Johnny', 'Kayla',
  'Howard', 'Alexis',
];

export const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
  'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White',
  'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker', 'Young',
  'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
  'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker',
  'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris', 'Morales', 'Murphy',
  'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper', 'Peterson', 'Bailey',
  'Reed', 'Kelly', 'Howard', 'Ramos', 'Kim', 'Cox', 'Ward', 'Richardson',
  'Watson', 'Brooks', 'Chavez', 'Wood', 'James', 'Bennett', 'Gray', 'Mendoza',
  'Ruiz', 'Hughes', 'Price', 'Alvarez', 'Castillo', 'Sanders', 'Patel', 'Myers',
  'Long', 'Ross', 'Foster', 'Jimenez', 'Powell', 'Jenkins', 'Perry', 'Russell',
  'Sullivan', 'Bell', 'Coleman', 'Butler', 'Henderson', 'Barnes', 'Gonzales', 'Fisher',
  'Vasquez', 'Simmons', 'Romero', 'Jordan', 'Patterson', 'Alexander', 'Hamilton', 'Graham',
  'Reynolds', 'Griffin', 'Wallace', 'Moreno', 'West', 'Cole', 'Hayes', 'Bryant',
  'Herrera', 'Gibson', 'Ellis', 'Tran', 'Medina', 'Aguilar', 'Stevens', 'Murray',
  'Ford', 'Castro', 'Marshall', 'Owens', 'Harrison', 'Fernandez', 'McDonald', 'Woods',
  'Washington', 'Kennedy', 'Wells', 'Vargas', 'Henry', 'Chen', 'Freeman', 'Webb',
  'Tucker', 'Guzman', 'Burns', 'Crawford', 'Olson', 'Simpson', 'Porter', 'Hunter',
  'Gordon', 'Mendez', 'Silva', 'Shaw', 'Snyder', 'Mason', 'Dixon', 'Munoz',
];

const STREET_NAMES = [
  'Oak St', 'Maple Ave', 'High St', 'Broad St', 'Main St', 'Walnut St', 'Chestnut St',
  'Spring St', 'Cherry Ln', 'Park Ave', 'Riverside Dr', 'Lincoln Ave', 'Grant Ave',
  'Summit St', 'College Rd', 'Franklin Blvd', 'Hudson St', 'Market St', 'State St',
  'W 5th Ave', 'E Broad St', 'N High St', 'S Front St', 'Indianola Ave', 'King Ave',
];

const VENDOR_NAMES = [
  'Columbus Fresh Kitchen',
  'Midwest Meal Partners',
  'Capital City Catering',
  'Ohio Valley Foods',
  'Buckeye Box Co',
  'Northside Nutrition',
  'Franklinton Fare',
  'Short North Supper Club',
];

export const PRODUCE_VENDOR_NAMES = [
  'Summit Valley Farms',
  'Heritage Orchard Co',
  'Greenfield Harvest LLC',
  'Riverside Produce Exchange',
];

/** Columbus-area delivery zones — one driver per zone */
export const ROUTE_ZONES = [
  { label: 'Clintonville', hubLat: 40.028, hubLng: -83.002, spanLat: 0.022, spanLng: 0.028 },
  { label: 'German Village', hubLat: 39.948, hubLng: -82.99, spanLat: 0.018, spanLng: 0.024 },
  { label: 'Franklinton', hubLat: 39.958, hubLng: -83.018, spanLat: 0.02, spanLng: 0.026 },
  { label: 'University District', hubLat: 39.992, hubLng: -83.008, spanLat: 0.019, spanLng: 0.025 },
  { label: 'Beechwold', hubLat: 40.048, hubLng: -83.018, spanLat: 0.021, spanLng: 0.027 },
  { label: 'Bexley', hubLat: 39.968, hubLng: -82.938, spanLat: 0.02, spanLng: 0.024 },
  { label: 'Westerville', hubLat: 40.118, hubLng: -82.93, spanLat: 0.024, spanLng: 0.03 },
  { label: 'Grove City', hubLat: 39.878, hubLng: -83.09, spanLat: 0.022, spanLng: 0.028 },
  { label: 'Dublin', hubLat: 40.102, hubLng: -83.14, spanLat: 0.025, spanLng: 0.032 },
  { label: 'Hilliard', hubLat: 40.034, hubLng: -83.12, spanLat: 0.023, spanLng: 0.029 },
  { label: 'Gahanna', hubLat: 39.968, hubLng: -82.878, spanLat: 0.02, spanLng: 0.026 },
  { label: 'Polaris', hubLat: 40.148, hubLng: -82.998, spanLat: 0.024, spanLng: 0.03 },
];

const NAVIGATOR_FIRST = ['Sarah', 'Michael', 'Rachel', 'David', 'Laura', 'Kevin', 'Jennifer', 'Brian'];

const MEAL_ITEM_NAMES = [
  'Scrambled eggs & toast', 'Oatmeal with berries', 'Greek yogurt parfait', 'Turkey sausage wrap',
  'Grilled chicken salad', 'Beef vegetable stew', 'Baked salmon plate', 'Pasta primavera',
  'Vegetable stir fry', 'Tuna salad sandwich', 'Chicken noodle soup', 'Garden chef salad',
  'Roast turkey dinner', 'Black bean bowl', 'Mediterranean plate', 'Mac and cheese cup',
];

const MENU_ITEM_NAMES = [
  'Roasted chicken breast', 'Seasonal vegetable medley', 'Brown rice pilaf', 'Whole wheat roll',
  'Garden side salad', 'Fresh fruit cup', 'Turkey meatloaf', 'Mashed potatoes',
  'Green beans almondine', 'Beef chili bowl', 'Coleslaw', 'Cornbread muffin',
  'Baked cod', 'Lemon herb quinoa', 'Steamed broccoli', 'Chicken tortilla soup',
];

export function realisticName(index: number): { first: string; last: string; full: string } {
  const first = FIRST_NAMES[index % FIRST_NAMES.length]!;
  const last = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length]!;
  const suffix = index >= FIRST_NAMES.length * LAST_NAMES.length ? ` ${Math.floor(index / 200) + 1}` : '';
  const full = `${first} ${last}${suffix}`.trim();
  return { first, last, full };
}

export function realisticEmail(first: string, last: string, index: number): string {
  const f = first.toLowerCase().replace(/[^a-z]/g, '');
  const l = last.toLowerCase().replace(/[^a-z]/g, '');
  const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'icloud.com', 'hotmail.com'];
  return `${f}.${l}${index % 97}@${domains[index % domains.length]}`;
}

export function realisticPhone(index: number): string {
  const area = ['614', '740', '513', '937'][index % 4];
  return `(${area}) ${String(200 + (index % 800)).padStart(3, '0')}-${String(1000 + (index % 9000)).padStart(4, '0')}`;
}

export function realisticStreet(index: number): string {
  const n = 120 + (index % 8800);
  return `${n} ${STREET_NAMES[index % STREET_NAMES.length]}`;
}

/** Spread clients across Columbus metro */
export function metroLatLng(index: number): { lat: number; lng: number } {
  const row = Math.floor(index / 50);
  const col = index % 50;
  return {
    lat: 39.92 + row * 0.012 + ((index * 7) % 100) * 0.0001,
    lng: -83.08 - col * 0.014 + ((index * 11) % 100) * 0.0001,
  };
}

/** Stop within a geographic zone — winding neighborhood path, not a circle/square */
export function zoneStopLatLng(
  zoneIndex: number,
  stopIndex: number,
  stopCount: number
): { lat: number; lng: number } {
  const zone = ROUTE_ZONES[zoneIndex % ROUTE_ZONES.length]!;
  const n = Math.max(stopCount, 1);
  const leg = stopIndex / n;
  const row = Math.floor((stopIndex * 1.7) % Math.ceil(Math.sqrt(n)));
  const col = stopIndex % Math.max(Math.ceil(Math.sqrt(n)), 1);
  const wind = Math.sin(stopIndex * 0.85 + zoneIndex) * 0.004;
  const along = Math.cos(stopIndex * 0.55) * 0.003;
  return {
    lat:
      zone.hubLat -
      zone.spanLat / 2 +
      (row / Math.max(Math.ceil(Math.sqrt(n)), 1)) * zone.spanLat +
      wind +
      along,
    lng:
      zone.hubLng -
      zone.spanLng / 2 +
      (col / Math.max(Math.ceil(Math.sqrt(n)), 1)) * zone.spanLng +
      wind * 0.7 -
      along * 1.2,
  };
}

export function zoneDriverName(zoneIndex: number): string {
  const zone = ROUTE_ZONES[zoneIndex % ROUTE_ZONES.length]!;
  return `${zone.label} Route`;
}

export function produceVendorName(index: number): string {
  return PRODUCE_VENDOR_NAMES[index % PRODUCE_VENDOR_NAMES.length]!;
}

/** @deprecated use zoneStopLatLng */
export function routePathLatLng(
  routeIndex: number,
  stopIndex: number,
  stopCount: number
): { lat: number; lng: number } {
  return zoneStopLatLng(routeIndex, stopIndex, stopCount);
}

export function vendorName(index: number): string {
  return VENDOR_NAMES[index % VENDOR_NAMES.length]!;
}

export function navigatorName(index: number): string {
  return `${NAVIGATOR_FIRST[index % NAVIGATOR_FIRST.length]} ${LAST_NAMES[(index + 17) % LAST_NAMES.length]}`;
}

export function menuItemName(index: number): string {
  return MENU_ITEM_NAMES[index % MENU_ITEM_NAMES.length]!;
}

export function mealItemName(index: number): string {
  return MEAL_ITEM_NAMES[index % MEAL_ITEM_NAMES.length]!;
}

/** @deprecated use realisticName */
export function demoFullName(index: number): string {
  return realisticName(index).full;
}

export const demoPhone = realisticPhone;
export const demoStreet = realisticStreet;
export const demoLatLng = metroLatLng;
