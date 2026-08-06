import {
  Search,
  CalendarCheck,
  CalendarClock,
  BadgeDollarSign,
  BookOpen,
  ClipboardList,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Layers3,
  PieChart,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
  UserRound,
  Users,
  UserSquare2,
} from "lucide-react";
import type { NavSection } from "@/types/common";
import type { Role } from "@/types/auth";

/** Central navigation registry — one source of truth for every menu. */
export const dashboardNavigation: NavSection[] = [
  {
    titleKey: "section.general",
    items: [
      // Same destination, role-specific label: a teacher's landing page IS their
      // day, so "Aujourd'hui" states its purpose where "Tableau de bord" only
      // named a control panel. Split by role rather than adding a label-override
      // field, so the registry stays declarative.
      {
        labelKey: "menu.overview",
        to: "/dashboard",
        icon: LayoutDashboard,
        exact: true,
        roles: ["admin", "student"],
      },
      {
        labelKey: "menu.today",
        to: "/dashboard",
        icon: CalendarClock,
        exact: true,
        roles: ["teacher"],
      },
    ],
  },
  {
    titleKey: "section.management",
    items: [
      { labelKey: "menu.students", to: "/dashboard/students", icon: Users, roles: ["admin"] },
      {
        labelKey: "menu.teachers",
        to: "/dashboard/teachers",
        icon: UserSquare2,
        roles: ["admin"],
      },
      { labelKey: "menu.subjects", to: "/dashboard/subjects", icon: BookOpen, roles: ["admin"] },
      { labelKey: "menu.levels", to: "/dashboard/levels", icon: Layers3, roles: ["admin"] },
      { labelKey: "menu.groups", to: "/dashboard/groups", icon: GraduationCap, roles: ["admin"] },
      {
        labelKey: "menu.registrations",
        to: "/dashboard/registrations",
        icon: ClipboardList,
        roles: ["admin"],
      },
      {
        labelKey: "menu.attendance",
        to: "/dashboard/attendance",
        icon: CalendarCheck,
        roles: ["admin", "teacher"],
      },
      {
        labelKey: "menu.attendanceReport",
        to: "/dashboard/attendance-report",
        icon: PieChart,
        roles: ["admin", "teacher"],
      },
    ],
  },
  {
    titleKey: "section.business",
    items: [
      {
        labelKey: "menu.payments",
        to: "/dashboard/payments",
        icon: BadgeDollarSign,
        roles: ["admin"],
        comingSoon: true,
      },
      {
        labelKey: "menu.invoices",
        to: "/dashboard/invoices",
        icon: FileText,
        roles: ["admin"],
        comingSoon: true,
      },
      {
        labelKey: "menu.reports",
        to: "/dashboard/reports",
        icon: PieChart,
        roles: ["admin"],
        comingSoon: true,
      },
    ],
  },
  {
    titleKey: "section.space",
    items: [
      // Teacher area. `/dashboard/teacher` used to live here and rendered the
      // exact same component as `/dashboard` -- two menu entries, one screen.
      // The route now redirects; the workspace is reached from "Aujourd'hui".
      {
        labelKey: "menu.myGroups",
        to: "/dashboard/my-groups",
        icon: GraduationCap,
        roles: ["teacher"],
      },
      {
        labelKey: "menu.myStudents",
        to: "/dashboard/my-students",
        icon: Users,
        roles: ["teacher"],
      },
      // Student area. Each entry answers exactly one question; none overlap.
      {
        labelKey: "menu.myClasses",
        to: "/dashboard/my-classes",
        icon: GraduationCap,
        roles: ["student"],
      },
      {
        labelKey: "menu.schedule",
        to: "/dashboard/schedule",
        icon: CalendarClock,
        roles: ["student"],
      },
      {
        labelKey: "menu.myAttendance",
        to: "/dashboard/my-attendance",
        icon: CalendarCheck,
        roles: ["student"],
      },
      {
        labelKey: "menu.registration",
        to: "/dashboard/registration",
        icon: Search,
        roles: ["student"],
      },
      {
        labelKey: "menu.myRegistrations",
        to: "/dashboard/my-registrations",
        icon: ClipboardList,
        roles: ["student"],
      },
    ],
  },
  {
    titleKey: "section.settings",
    items: [
      {
        labelKey: "menu.myProfile",
        to: "/dashboard/profile",
        icon: UserRound,
      },
      {
        labelKey: "menu.settings",
        to: "/dashboard/settings",
        icon: SlidersHorizontal,
        roles: ["admin"],
      },
      {
        labelKey: "menu.users",
        to: "/dashboard/users",
        icon: UserCog,
        roles: ["admin"],
        comingSoon: true,
      },
      {
        labelKey: "menu.security",
        to: "/dashboard/security",
        icon: ShieldCheck,
        roles: ["admin"],
        comingSoon: true,
      },
    ],
  },
];

export function filterNavigationByRole(sections: NavSection[], role: Role | null): NavSection[] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.roles || (role && item.roles.includes(role))),
    }))
    .filter((section) => section.items.length > 0);
}

/** Every navigable (implemented) destination — used by the global search palette. */
export function navigableItems(role: Role | null) {
  return filterNavigationByRole(dashboardNavigation, role)
    .flatMap((section) => section.items)
    .filter((item) => !item.comingSoon);
}
