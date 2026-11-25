import React from "react";
import {BrowserRouter, HashRouter, Routes, Route, Navigate} from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import LicenseList from "./pages/LicenseList";
import APIKeyList from "./pages/APIKeyList";
import UserManagement from "./pages/UserManagement";
import About from "./pages/About";
import {isAuthenticated} from "./utils/auth";
import {DEMO_MODE} from "./config";

// Redirect to the login page when no token is stored.
function ProtectedRoute({children}) {
    return isAuthenticated() ? children : <Navigate to="/" replace/>;
}

// GitHub Pages serves static files only, so the demo build uses hash
// routing (no server-side fallback needed). Normal builds keep
// BrowserRouter.
const Router = DEMO_MODE ? HashRouter : BrowserRouter;

function App() {
    return (
        <Router>
            {DEMO_MODE && (
                <div
                    style={{
                        position: "fixed",
                        top: 8,
                        right: 8,
                        zIndex: 1000,
                        background: "#f59e0b",
                        color: "#111",
                        fontSize: 12,
                        fontWeight: "bold",
                        padding: "4px 10px",
                        borderRadius: 999,
                    }}
                >
                    Demo — sample data, stored only in your browser
                </div>
            )}
            <Routes>
                <Route path="/" element={<Login/>}/>
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard/></ProtectedRoute>}/>
                <Route path="/settings" element={<ProtectedRoute><Settings/></ProtectedRoute>}/>
                <Route path="/licenses" element={<ProtectedRoute><LicenseList/></ProtectedRoute>}/>
                <Route path="/api-keys" element={<ProtectedRoute><APIKeyList/></ProtectedRoute>}/>
                <Route path="/users" element={<ProtectedRoute><UserManagement/></ProtectedRoute>}/>
                <Route path="/about" element={<ProtectedRoute><About/></ProtectedRoute>}/>
            </Routes>
        </Router>
    );
}

export default App;
