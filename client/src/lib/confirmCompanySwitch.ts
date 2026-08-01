import Swal from "sweetalert2";

/** Confirmação de troca de empresa, com a paleta/fontes do projeto. Retorna true se confirmado. */
export async function confirmCompanySwitch(fromName: string | undefined, toName: string): Promise<boolean> {
  const result = await Swal.fire({
    title: "Trocar de empresa?",
    html: fromName
      ? `Você vai passar de <strong>${fromName}</strong> para <strong>${toName}</strong>. Todos os dados exibidos no painel vão mudar para a nova empresa.`
      : `Você vai visualizar os dados de <strong>${toName}</strong>.`,
    icon: "question",
    showCancelButton: true,
    confirmButtonText: "Trocar empresa",
    cancelButtonText: "Cancelar",
    reverseButtons: true,
    background: "var(--popover)",
    color: "var(--popover-foreground)",
    confirmButtonColor: "var(--primary)",
    cancelButtonColor: "var(--muted-foreground)",
    customClass: {
      popup: "swal-project-popup",
      title: "swal-project-title",
      confirmButton: "swal-project-confirm",
      cancelButton: "swal-project-cancel",
    },
  });
  return result.isConfirmed;
}
