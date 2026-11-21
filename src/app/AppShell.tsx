import { AnimatePresence, motion } from "motion/react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { TitleBar } from "@/components/shell/TitleBar";
import { Sidebar } from "@/components/shell/Sidebar";
import { AssistantPanel } from "@/components/shell/AssistantPanel";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { ShortcutsDialog } from "@/components/shell/ShortcutsDialog";
import { HomePage } from "@/pages/Home";
import { ContactFormDialog } from "@/features/people/ContactFormDialog";
import { PeopleRoutes } from "@/features/people/PeopleRoutes";
import { PipelinePage } from "@/pages/Pipeline";
import { DealFormDialog } from "@/features/pipeline/DealFormDialog";
import { StagesDialog } from "@/features/pipeline/StagesDialog";
import { ReminderFormDialog } from "@/features/reminders/ReminderFormDialog";
import { ImportDialog } from "@/features/transfer/ImportDialog";
import { RemindersPage } from "@/pages/Reminders";
import { SettingsPage } from "@/pages/Settings";
import { pageVariants } from "@/lib/motion";
import { useSide } from "./settings";
import { useShortcuts } from "./useShortcuts";

export function AppShell() {
  const location = useLocation();
  const side = useSide();
  useShortcuts();

  // Key transitions by top-level section so nested routes (e.g. /people/:id) can animate on their own.
  const section = "/" + (location.pathname.split("/")[1] ?? "");

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex min-h-0 flex-1 pb-2 pr-2">
        <Sidebar />
        <main className="glass relative min-w-0 flex-1 overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={section}
              variants={pageVariants}
              initial="initial"
              animate="enter"
              exit="exit"
              className="absolute inset-0 overflow-y-auto"
            >
              <Routes location={location}>
                <Route path="/" element={<HomePage />} />
                <Route path="/people/*" element={<PeopleRoutes />} />
                <Route path="/pipeline" element={side === "business" ? <PipelinePage /> : <Navigate to="/" replace />} />
                <Route path="/reminders" element={<RemindersPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </main>
        <AssistantPanel />
      </div>
      <CommandPalette />
      <ContactFormDialog />
      <ReminderFormDialog />
      <DealFormDialog />
      <ImportDialog />
      <StagesDialog />
      <ShortcutsDialog />
    </div>
  );
}
