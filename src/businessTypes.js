import { Dumbbell, GraduationCap, HeartPulse, Store, MoreHorizontal, School } from "lucide-react";

export const businessTypes = {
  gym: { en: "Gym", hi: "जिम", icon: Dumbbell, modules: ["people", "plans", "attendance", "batches", "payments", "expenses", "reports", "settings"], dashboard: ["members", "attendance", "dues", "expiring"] },
  coaching: { en: "Coaching", hi: "कोचिंग", icon: GraduationCap, modules: ["people", "plans", "attendance", "batches", "payments", "expenses", "reports", "settings"], dashboard: ["students", "attendance", "dues", "followups"] },
  yoga: { en: "Yoga / Dance", hi: "योग / डांस", icon: HeartPulse, modules: ["people", "plans", "attendance", "batches", "payments", "expenses", "reports", "settings"], dashboard: ["members", "attendance", "dues", "expiring"] },
  retail: { en: "Retail Shop", hi: "दुकान", icon: Store, modules: ["products", "sales", "customers", "suppliers", "expenses", "reports", "settings"], dashboard: ["sales", "bills", "udhaar", "lowStock"] },
  other: { en: "Other", hi: "अन्य", icon: MoreHorizontal, modules: ["people", "payments", "expenses", "reports", "settings"], dashboard: ["people", "payments", "expenses", "reports"] },
  school: { en: "School", hi: "स्कूल", icon: School, modules: ["school", "expenses", "reports", "settings"], dashboard: ["students", "attendance", "fees", "classes"] },
};

export const sharedModules = ["expenses", "reports", "settings"];
export const isAllowed = (type, module) => businessTypes[type]?.modules.includes(module) || sharedModules.includes(module);
