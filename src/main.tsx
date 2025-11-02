import { createRoot } from "react-dom/client";
import "./core/styles/index.css";
import App from "./core/components/App.tsx";

createRoot(document.getElementById("root")!).render(<App />);
