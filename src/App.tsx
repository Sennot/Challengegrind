import { BrowserRouter, Route, Routes } from "react-router";
import { AuthProvider } from "./lib/auth";
import Layout from "./components/Layout";
import ListPage from "./pages/ListPage";
import LevelPage from "./pages/LevelPage";
import StatsPage from "./pages/StatsPage";
import ProfilePage from "./pages/ProfilePage";
import ChangelogPage from "./pages/ChangelogPage";
import SubmitPage from "./pages/SubmitPage";
import SubmitLevelPage from "./pages/SubmitLevelPage";
import SettingsPage from "./pages/SettingsPage";
import AdminPage from "./pages/admin/AdminPage";
import { LoginPage, RegisterPage } from "./pages/AuthPages";
import { NotFoundPage, RulesPage, SocialsPage, TeamPage } from "./pages/InfoPages";

// Every page exists on both lists: "/…" is the Challenge List, "/scl/…" the Spam Challenge List
const pages = (
  <>
    <Route index element={<ListPage />} />
    <Route path="level/:id" element={<LevelPage />} />
    <Route path="stats" element={<StatsPage />} />
    <Route path="player/:username" element={<ProfilePage />} />
    <Route path="changelog" element={<ChangelogPage />} />
    <Route path="submit" element={<SubmitPage />} />
    <Route path="submit-level" element={<SubmitLevelPage />} />
    <Route path="rules" element={<RulesPage />} />
    <Route path="team" element={<TeamPage />} />
    <Route path="socials" element={<SocialsPage />} />
    <Route path="login" element={<LoginPage />} />
    <Route path="register" element={<RegisterPage />} />
    <Route path="settings" element={<SettingsPage />} />
    <Route path="admin" element={<AdminPage />} />
  </>
);

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            {pages}
            <Route path="scl">{pages}</Route>
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
