import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { AppProvider } from "./contexts/AppContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import CadastroAreas from "./pages/CadastroAreas";
import CadastroEmpresas from "./pages/CadastroEmpresas";
import CadastroIndicadores from "./pages/CadastroIndicadores";
import CadastroPerspectivas from "./pages/CadastroPerspectivas";
import CadastroObjetivos from "./pages/CadastroObjetivos";
import CadastroRegras from "./pages/CadastroRegras";
import DashboardAreas from "./pages/DashboardAreas";
import DashboardIndicadores from "./pages/DashboardIndicadores";
import DashboardObjetivos from "./pages/DashboardObjetivos";
import DashboardPerspectivas from "./pages/DashboardPerspectivas";
import Evolucao from "./pages/Evolucao";
import Heatmap from "./pages/Heatmap";
import Organograma from "./pages/Organograma";
import Home from "./pages/Home";
import Importacao from "./pages/Importacao";
import Lancamentos from "./pages/Lancamentos";
import Parametrizacao from "./pages/Parametrizacao";
import Ranking from "./pages/Ranking";
import Usuarios from "./pages/Usuarios";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/dashboard/areas"} component={DashboardAreas} />
        <Route path={"/dashboard/perspectivas"} component={DashboardPerspectivas} />
        <Route path={"/dashboard/objetivos"} component={DashboardObjetivos} />
        <Route path={"/dashboard/indicadores"} component={DashboardIndicadores} />
        <Route path={"/dashboard/evolucao"} component={Evolucao} />
        <Route path={"/dashboard/ranking"} component={Ranking} />
        <Route path={"/dashboard/heatmap"} component={Heatmap} />
        <Route path={"/dashboard/organograma"} component={Organograma} />
        <Route path={"/lancamentos"} component={Lancamentos} />
        <Route path={"/importacao"} component={Importacao} />
        <Route path={"/cadastros/empresas"} component={CadastroEmpresas} />
        <Route path={"/cadastros/areas"} component={CadastroAreas} />
        <Route path={"/cadastros/perspectivas"} component={CadastroPerspectivas} />
        <Route path={"/cadastros/objetivos"} component={CadastroObjetivos} />
        <Route path={"/cadastros/regras"} component={CadastroRegras} />
        <Route path={"/cadastros/indicadores"} component={CadastroIndicadores} />
        <Route path={"/cadastros/parametrizacao"} component={Parametrizacao} />
        <Route path={"/admin/usuarios"} component={Usuarios} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster position="top-right" richColors />
          <AppProvider>
            <Router />
          </AppProvider>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
