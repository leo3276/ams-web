export type BusinessArchetypeId =
  | 'education_schools'
  | 'retail_wholesale'
  | 'services_artisans'
  | 'professional_corporate'
  | 'food_hospitality'
  | 'churches_nonprofits'
  | 'agriculture_farming'
  | 'logistics_transport';

export interface FeeItemPreset {
  id: string;
  name: string;
  defaultAmount: number;
  category: 'tuition' | 'feeding' | 'transport' | 'uniform' | 'books' | 'pta' | 'exam' | 'other';
}

export interface ArchetypeConfig {
  id: BusinessArchetypeId;
  label: string;
  shortName: string;
  icon: string;
  badgeColor: string;
  description: string;
  subCategories: string[];
  vocabulary: {
    dashboardTitle: string;
    dashboardSubtitle: string;
    customersTitle: string;
    customerSingular: string;
    customerEntityLabel: string;
    customerContactLabel: string;
    customerPhoneHelp: string;
    invoicesTitle: string;
    invoiceSingular: string;
    invoiceDescriptionHelp: string;
    inventoryTitle: string;
    inventorySingular: string;
    revenueTitle: string;
    arrearsTitle: string;
    recordSaleTitle: string;
    bookkeepingTitle: string;
    suppliersTitle: string;
    teamTitle: string;
    reportsTitle: string;
    pnlTitle: string;
  };
  featureFlags: {
    enableClassRosters?: boolean;
    enableBulkClassBilling?: boolean;
    enableParentWhatsApp?: boolean;
    enableBarcode?: boolean;
    enableExpiryDates?: boolean;
    enableStaffCommissions?: boolean;
    enableTableOrders?: boolean;
    enableChurchFunds?: boolean;
    enableLivestockCycles?: boolean;
    enableWaybillManifest?: boolean;
  };
  gradeLevels?: string[];
  terms?: string[];
  feePresets?: FeeItemPreset[];
}

export const GHANAIAN_GRADE_LEVELS = [
  'Creche',
  'Nursery 1',
  'Nursery 2',
  'Kindergarten 1 (KG 1)',
  'Kindergarten 2 (KG 2)',
  'Basic 1 (Class 1)',
  'Basic 2 (Class 2)',
  'Basic 3 (Class 3)',
  'Basic 4 (Class 4)',
  'Basic 5 (Class 5)',
  'Basic 6 (Class 6)',
  'JHS 1',
  'JHS 2',
  'JHS 3',
  'SHS 1 / Form 1',
  'SHS 2 / Form 2',
  'SHS 3 / Form 3',
  'Vocational / Training Class',
];

export const SCHOOL_TERMS = [
  'Term 1',
  'Term 2',
  'Term 3',
  'Semester 1',
  'Semester 2',
];

export const DEFAULT_FEE_PRESETS: FeeItemPreset[] = [
  { id: 'tuition', name: 'Tuition / Academic Fee', defaultAmount: 600, category: 'tuition' },
  { id: 'feeding', name: 'Canteen & Feeding Fee', defaultAmount: 350, category: 'feeding' },
  { id: 'transport', name: 'School Bus / Transport', defaultAmount: 250, category: 'transport' },
  { id: 'pta', name: 'PTA Development Levy', defaultAmount: 50, category: 'pta' },
  { id: 'exam', name: 'Examination & ICT Lab Fee', defaultAmount: 80, category: 'exam' },
  { id: 'uniform', name: 'School Uniform & Sportswear', defaultAmount: 150, category: 'uniform' },
  { id: 'books', name: 'Textbooks & Stationery Pack', defaultAmount: 200, category: 'books' },
];

export const ARCHETYPES: Record<BusinessArchetypeId, ArchetypeConfig> = {
  education_schools: {
    id: 'education_schools',
    label: 'Schools, Creches & Academies',
    shortName: 'Education',
    icon: '🎓',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/40 dark:text-purple-300',
    description: 'Designed for private schools, Montessori creches, preparatory academies & vocational institutes.',
    subCategories: ['Daycare / Creche', 'Montessori / Kindergarten', 'Basic & Preparatory School', 'Junior High School (JHS)', 'Senior High / College', 'Vocational & Training Institute'],
    vocabulary: {
      dashboardTitle: 'School Administration & Fee Hub',
      dashboardSubtitle: 'Monitor term fee inflows, track unpaid parent arrears, and manage enrolled pupils class by class.',
      customersTitle: 'Student Directory & Class Rosters',
      customerSingular: 'Student',
      customerEntityLabel: 'Student Full Name',
      customerContactLabel: 'Parent / Guardian Name',
      customerPhoneHelp: 'Parent WhatsApp for fee statements & arrears reminders',
      invoicesTitle: 'Term Fee Bills & Invoicing',
      invoiceSingular: 'Term Fee Bill',
      invoiceDescriptionHelp: 'e.g. 2025/2026 Academic Year - Term 1 Fees',
      inventoryTitle: 'Fee Schedule, Rates & Uniforms',
      inventorySingular: 'Fee Item / Uniform',
      revenueTitle: 'Tuition & Fee Collections',
      arrearsTitle: 'Unpaid Parent Fee Arrears',
      recordSaleTitle: 'Record Fee Payment / Inflow',
      bookkeepingTitle: 'School Income & Expense Ledger',
      suppliersTitle: 'School Vendors & Creditors',
      teamTitle: 'Teachers & School Staff Payroll',
      reportsTitle: 'Termly Income & Expenditure',
      pnlTitle: 'Income & Expenditure Statement',
    },
    featureFlags: {
      enableClassRosters: true,
      enableBulkClassBilling: true,
      enableParentWhatsApp: true,
    },
    gradeLevels: GHANAIAN_GRADE_LEVELS,
    terms: SCHOOL_TERMS,
    feePresets: DEFAULT_FEE_PRESETS,
  },

  retail_wholesale: {
    id: 'retail_wholesale',
    label: 'Supermarkets, Shops & Pharmacies',
    shortName: 'Retail & POS',
    icon: '🛒',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/40 dark:text-emerald-300',
    description: 'High-speed POS checkout, barcode inventory, and supplier debt for retail shops and pharmacies.',
    subCategories: ['Supermarket & Provision Shop', 'Pharmacy & Chemist', 'Boutique & Fashion Store', 'Auto Parts & Hardware', 'Wholesale FMCG Distributor', 'Cosmetics & Beauty Supply'],
    vocabulary: {
      dashboardTitle: 'Business Dashboard & POS Live Hub',
      dashboardSubtitle: 'Real-time sales tracking, stock levels, profit margins, and cash till reconciliation.',
      customersTitle: 'Customers & Debtors',
      customerSingular: 'Customer',
      customerEntityLabel: 'Customer / Buyer Name',
      customerContactLabel: 'Contact Person',
      customerPhoneHelp: 'Customer Phone / WhatsApp for receipt delivery',
      invoicesTitle: 'Sales Invoices & Receipts',
      invoiceSingular: 'Invoice',
      invoiceDescriptionHelp: 'Items purchased or order summary',
      inventoryTitle: 'Inventory, POS & Stock Registry',
      inventorySingular: 'Product / Stock Item',
      revenueTitle: 'Sales & Revenue Inflows',
      arrearsTitle: 'Customer Receivables & Debt',
      recordSaleTitle: 'Record Sale / POS Checkout',
      bookkeepingTitle: 'Daily Cash & Sales Ledger',
      suppliersTitle: 'Suppliers & Creditors',
      teamTitle: 'Cashiers & Store Staff',
      reportsTitle: 'Financial & Tax Reports',
      pnlTitle: 'Profit & Loss Statement',
    },
    featureFlags: {
      enableBarcode: true,
      enableExpiryDates: true,
    },
  },

  services_artisans: {
    id: 'services_artisans',
    label: 'Salons, Spas & Auto Garages',
    shortName: 'Services',
    icon: '✂️',
    badgeColor: 'bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-900/40 dark:text-pink-300',
    description: 'Service menus, technician job cards, customer deposits, and staff commission splits.',
    subCategories: ['Hair Salon & Barbershop', 'Beauty Spa & Nail Studio', 'Auto Mechanic & Garage', 'Tailoring & Fashion Designer', 'Electrician / Plumber / Artisan', 'Photography & Media Studio'],
    vocabulary: {
      dashboardTitle: 'Service Hub & Commission Overview',
      dashboardSubtitle: 'Track billed client appointments, technician commissions, and customer booking balances.',
      customersTitle: 'Clients & Customers',
      customerSingular: 'Client',
      customerEntityLabel: 'Client Full Name',
      customerContactLabel: 'Representative / Phone',
      customerPhoneHelp: 'Client WhatsApp for booking confirmation & quotes',
      invoicesTitle: 'Service Invoices & Job Cards',
      invoiceSingular: 'Service Bill',
      invoiceDescriptionHelp: 'e.g. Executive Braiding / Full Brake Pad Overhaul',
      inventoryTitle: 'Service Menu, Rates & Supplies',
      inventorySingular: 'Service / Consumable',
      revenueTitle: 'Workmanship & Service Inflows',
      arrearsTitle: 'Unsettled Client Balances',
      recordSaleTitle: 'Record Completed Service',
      bookkeepingTitle: 'Service Income & Expense Ledger',
      suppliersTitle: 'Parts & Product Suppliers',
      teamTitle: 'Technicians & Stylists',
      reportsTitle: 'Service P&L & Commission Reports',
      pnlTitle: 'Profit & Loss Statement',
    },
    featureFlags: {
      enableStaffCommissions: true,
    },
  },

  professional_corporate: {
    id: 'professional_corporate',
    label: 'Law Firms, Clinics & Agencies',
    shortName: 'Corporate',
    icon: '⚖️',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-300',
    description: 'Corporate client retainers, legal matter billing, medical clinic invoices, and formal PDF quotes.',
    subCategories: ['Legal Chambers & Law Practice', 'Medical Clinic & Diagnostic Lab', 'Consulting & Accounting Firm', 'Tech, Software & Digital Agency', 'Real Estate Brokerage', 'Architectural & Engineering Firm'],
    vocabulary: {
      dashboardTitle: 'Executive Operations & Retainer Hub',
      dashboardSubtitle: 'Track billable corporate retainers, project milestones, patient invoices, and consultancy fees.',
      customersTitle: 'Corporate Clients & Patients',
      customerSingular: 'Client / Patient',
      customerEntityLabel: 'Client / Company Name',
      customerContactLabel: 'Managing Director / Contact',
      customerPhoneHelp: 'Official WhatsApp for executive fee notes & statements',
      invoicesTitle: 'Retainers & Fee Notes',
      invoiceSingular: 'Fee Note / Retainer',
      invoiceDescriptionHelp: 'e.g. Q3 Legal Retainer / Diagnostic Health Check',
      inventoryTitle: 'Billable Rates & Service Packages',
      inventorySingular: 'Billable Service / Rate',
      revenueTitle: 'Retainers & Professional Fees',
      arrearsTitle: 'Outstanding Client Retainers',
      recordSaleTitle: 'Issue Retainer / Record Fee',
      bookkeepingTitle: 'Executive Financial Ledger',
      suppliersTitle: 'Vendors & Office Creditors',
      teamTitle: 'Associates & Medical/Legal Staff',
      reportsTitle: 'Statement of Operations & Tax',
      pnlTitle: 'Statement of Operations',
    },
    featureFlags: {},
  },

  food_hospitality: {
    id: 'food_hospitality',
    label: 'Restaurants, Chop Bars & Bakeries',
    shortName: 'Hospitality',
    icon: '🍽️',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/40 dark:text-amber-300',
    description: 'Table order tickets, daily ingredient recipe costing, fast food billing, and shift reconciliations.',
    subCategories: ['Fast Food & Chop Bar', 'Fine Dining Restaurant', 'Bakery & Pastry Shop', 'Pub, Bar & Lounge', 'Catering & Event Food Service', 'Cafe & Juice Bar'],
    vocabulary: {
      dashboardTitle: 'Kitchen & Restaurant Inflow Hub',
      dashboardSubtitle: 'Track daily food & beverage orders, recipe ingredient costs, and register cash floats.',
      customersTitle: 'Patrons & Corporate Orders',
      customerSingular: 'Patron',
      customerEntityLabel: 'Guest / Corporate Order Name',
      customerContactLabel: 'Event / Booking Contact',
      customerPhoneHelp: 'Customer WhatsApp for order confirmation & slips',
      invoicesTitle: 'Order Bills & Event Invoices',
      invoiceSingular: 'Table Bill / Order',
      invoiceDescriptionHelp: 'Meal items, catering order, or drink tab',
      inventoryTitle: 'Menu Items & Ingredient Costing',
      inventorySingular: 'Menu Dish / Ingredient',
      revenueTitle: 'Food & Beverage Sales',
      arrearsTitle: 'Catering & Unpaid Tabs',
      recordSaleTitle: 'Record Order / POS Slip',
      bookkeepingTitle: 'Daily Restaurant Sales Ledger',
      suppliersTitle: 'Meat, Produce & Beverage Vendors',
      teamTitle: 'Chefs, Waiters & Kitchen Staff',
      reportsTitle: 'Hospitality P&L & Food Costing',
      pnlTitle: 'Restaurant Profit & Loss',
    },
    featureFlags: {
      enableTableOrders: true,
    },
  },

  churches_nonprofits: {
    id: 'churches_nonprofits',
    label: 'Churches, Mosques & NGOs',
    shortName: 'Faith & NGO',
    icon: '⛪',
    badgeColor: 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-900/40 dark:text-cyan-300',
    description: 'Digital tithes and offerings, donor pledge statements, building fund ledgers, and welfare tracking.',
    subCategories: ['Church & Ministry', 'Mosque & Islamic Center', 'Charity & Non-Profit NGO', 'Alumni Association & Club', 'Welfare & Community Union'],
    vocabulary: {
      dashboardTitle: 'Ministry Giving & Stewardship Hub',
      dashboardSubtitle: 'Track Sunday tithes, project pledges, welfare disbursements, and donor contributions.',
      customersTitle: 'Members, Donors & Partners',
      customerSingular: 'Member / Donor',
      customerEntityLabel: 'Member / Donor Name',
      customerContactLabel: 'Family / Cell Leader',
      customerPhoneHelp: 'Member WhatsApp for annual giving statements',
      invoicesTitle: 'Pledge Receipts & Giving Slips',
      invoiceSingular: 'Giving Receipt',
      invoiceDescriptionHelp: 'e.g. Building Fund Pledge / Annual Harvest Tithe',
      inventoryTitle: 'Church Assets & Giving Categories',
      inventorySingular: 'Giving Category / Asset',
      revenueTitle: 'Tithes, Offerings & Donations',
      arrearsTitle: 'Unfulfilled Donor Pledges',
      recordSaleTitle: 'Record Tithe / Offering',
      bookkeepingTitle: 'Income & Expenditure Ledger',
      suppliersTitle: 'Ministry Vendors & Creditors',
      teamTitle: 'Pastoral Staff & Ministry Workers',
      reportsTitle: 'Statement of Financial Position',
      pnlTitle: 'Income & Expenditure Statement',
    },
    featureFlags: {
      enableChurchFunds: true,
    },
  },

  agriculture_farming: {
    id: 'agriculture_farming',
    label: 'Farms & Agro-Processors',
    shortName: 'Agribusiness',
    icon: '🌾',
    badgeColor: 'bg-lime-100 text-lime-800 border-lime-300 dark:bg-lime-900/40 dark:text-lime-300',
    description: 'Poultry and livestock batch cycles, feed and medication logs, harvest yields, and off-taker billing.',
    subCategories: ['Poultry & Egg Production', 'Pig & Cattle Farm', 'Fish Farming & Aquaculture', 'Crop & Greenhouse Farming', 'Cocoa, Oil Palm & Cashew', 'Agro-Processing & Milling'],
    vocabulary: {
      dashboardTitle: 'Farm Operations & Harvest Hub',
      dashboardSubtitle: 'Monitor batch mortality rates, feed consumption costs, harvest yields, and wholesale revenue.',
      customersTitle: 'Off-Takers & Market Buyers',
      customerSingular: 'Buyer / Off-Taker',
      customerEntityLabel: 'Buyer / Processing Company',
      customerContactLabel: 'Purchasing Agent',
      customerPhoneHelp: 'Buyer WhatsApp for harvest delivery manifests',
      invoicesTitle: 'Harvest & Delivery Bills',
      invoiceSingular: 'Harvest Invoice',
      invoiceDescriptionHelp: 'e.g. 50 Crates of Eggs / 2 Tons of Maize',
      inventoryTitle: 'Crops, Livestock & Feed Stock',
      inventorySingular: 'Flock / Feed / Crop Batch',
      revenueTitle: 'Harvest & Livestock Sales',
      arrearsTitle: 'Unpaid Off-Taker Balances',
      recordSaleTitle: 'Record Harvest / Stock Sale',
      bookkeepingTitle: 'Farm Production Ledger',
      suppliersTitle: 'Feed Mills & Agro-Chemical Suppliers',
      teamTitle: 'Farm Hands & Field Supervisors',
      reportsTitle: 'Farm Cycle P&L & Yield Reports',
      pnlTitle: 'Farm Production Profit & Loss',
    },
    featureFlags: {
      enableLivestockCycles: true,
    },
  },

  logistics_transport: {
    id: 'logistics_transport',
    label: 'Logistics, Dispatch & Haulage',
    shortName: 'Logistics',
    icon: '🚚',
    badgeColor: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/40 dark:text-sky-300',
    description: 'Waybill delivery manifests, dispatch rider targets, vehicle maintenance and fuel expense logs.',
    subCategories: ['Motorcycle Courier & Dispatch', 'Truck Haulage & Tipper Service', 'Passenger Bus & Trotro Fleet', 'Car Rental & VIP Transport', 'Freight & Customs Clearance'],
    vocabulary: {
      dashboardTitle: 'Fleet & Dispatch Operations Hub',
      dashboardSubtitle: 'Track daily rider deliveries, driver remittances, fuel consumption, and freight invoices.',
      customersTitle: 'Shippers, Clients & Consignees',
      customerSingular: 'Shipper / Client',
      customerEntityLabel: 'Sender / Consignee Name',
      customerContactLabel: 'Dispatch Coordinator',
      customerPhoneHelp: 'Client WhatsApp for waybill status & delivery slips',
      invoicesTitle: 'Waybills & Delivery Invoices',
      invoiceSingular: 'Waybill Invoice',
      invoiceDescriptionHelp: 'e.g. Haulage Run: Tema Port to Kumasi Central',
      inventoryTitle: 'Fleet Vehicles & Spare Parts',
      inventorySingular: 'Vehicle / Spare Part',
      revenueTitle: 'Freight & Dispatch Inflows',
      arrearsTitle: 'Uncollected Delivery Fees',
      recordSaleTitle: 'Record Waybill / Trip Fare',
      bookkeepingTitle: 'Fleet Operations Ledger',
      suppliersTitle: 'Fuel Stations & Mechanics',
      teamTitle: 'Drivers, Riders & Dispatchers',
      reportsTitle: 'Fleet P&L & Cost-per-Kilometer',
      pnlTitle: 'Fleet Operations Profit & Loss',
    },
    featureFlags: {
      enableWaybillManifest: true,
    },
  },
};

export const DEFAULT_ARCHETYPE: BusinessArchetypeId = 'retail_wholesale';

export function getArchetypeConfig(archetypeId?: string | null): ArchetypeConfig {
  if (archetypeId && archetypeId in ARCHETYPES) {
    return ARCHETYPES[archetypeId as BusinessArchetypeId];
  }
  return ARCHETYPES[DEFAULT_ARCHETYPE];
}
