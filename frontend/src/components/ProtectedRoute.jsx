import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Guards routes that require an authenticated Firebase user.
export default function ProtectedRoute({ children }) {
  const { currentUser } = useAuth();
  if (!currentUser) return <Navigate to="/login" replace />;
  return children;
}
