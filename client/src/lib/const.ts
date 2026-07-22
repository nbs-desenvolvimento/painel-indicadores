// Precisa bater com server/_core/const.ts — client e server são pacotes
// independentes (sem código compartilhado), este valor é comparado contra a
// mensagem de erro que o server retorna em requests não autenticadas.
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
