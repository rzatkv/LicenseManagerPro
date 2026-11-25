import React from "react";
import {BrowserRouter, HashRouter, Routes, Route, Navigate} from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import LicenseList from "./pages/LicenseList";
import APIKeyList from "./pages/APIKeyList";
import UserManagement from "./pages/UserManagement";
import About from "./pages/About";
import Products from "./pages/Products";
import Languages from "./pages/Languages";
import ApiDocs from "./pages/ApiDocs";
import Layout from "./components/Layout";
import {LanguageProvider} from "./i18n";
import {ThemeProvider} from "./theme";
import {isAuthenticated} from "./utils/auth";
import {DEMO_MODE} from "./config";

function ProtectedRoute({children}) {
    return isAuthenticated() ? children : <Navigate to="/" replace/>;
}

const Router = DEMO_MODE ? HashRouter : BrowserRouter;

function App() {
    return (
        <ThemeProvider>
            <LanguageProvider>
                <Router>
                    <Routes>
                        <Route path="/" element={<Login/>}/>
                        <Route element={<ProtectedRoute><Layout/></ProtectedRoute>}>
                            <Route path="/dashboard" element={<Dashboard/>}/>
                            <Route path="/products" element={<Products/>}/>
                            <Route path="/licenses" element={<LicenseList/>}/>
                            <Route path="/api-keys" element={<APIKeyList/>}/>
                            <Route path="/users" element={<UserManagement/>}/>
                            <Route path="/languages" element={<Languages/>}/>
                            <Route path="/docs" element={<ApiDocs/>}/>
                            <Route path="/settings" element={<Settings/>}/>
                            <Route path="/about" element={<About/>}/>
                        </Route>
                    </Routes>
                </Router>
            </LanguageProvider>
        </ThemeProvider>
    );
}

export default App;
