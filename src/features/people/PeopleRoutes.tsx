import { AnimatePresence, motion } from "motion/react";
import { Route, Routes, useLocation } from "react-router-dom";
import { pageVariants } from "@/lib/motion";
import { ContactPage } from "./ContactPage";
import { PeoplePage } from "./PeoplePage";

/** The list and a person's page, with the same fade and slide between them as between sections. */
export function PeopleRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={location.pathname} variants={pageVariants} initial="initial" animate="enter" exit="exit">
        <Routes location={location}>
          <Route index element={<PeoplePage />} />
          <Route path=":id" element={<ContactPage />} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}
