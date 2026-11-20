import { AuthMoldura } from "../../LoginForm";
import { Spinner } from "../../_design/icons";
import "../../_design/auth.css";

/** Enquanto o convite é lido: já dentro da moldura de acesso, sem trocar de cenário. */
export default function JoinLoading() {
  return (
    <AuthMoldura>
      <div className="rv-header">
        <div className="rv-brand">
          <h1 className="rv-join-titulo">Convite</h1>
        </div>
      </div>
      <div className="rv-alert rv-alert--info" role="status">
        <Spinner size={12} className="rv-spin" />
        <span>Verificando convite…</span>
      </div>
    </AuthMoldura>
  );
}
