/**
 * Seed inicial com os dados da planilha GESTÃO DE INDICADORES:
 * 1 empresa, 4 perspectivas, 18 áreas, 26 indicadores, pesos e aplicabilidade,
 * além das metas/resultados de exemplo (jul/2026).
 */
import "dotenv/config";
import { Client } from "pg";

const conn = new Client({ connectionString: process.env.DATABASE_URL });
await conn.connect();

// Evita duplicar seed
const { rows: existingRows } = await conn.query("SELECT COUNT(*) AS c FROM companies");
if (Number(existingRows[0].c) > 0) {
  console.log("Seed já executado, abortando.");
  await conn.end();
  process.exit(0);
}

const { rows: cRows } = await conn.query(
  "INSERT INTO companies (name, cnpj) VALUES ($1, $2) RETURNING id",
  ["Grupo Policontrol", null],
);
const companyId = cRows[0].id;
console.log("Empresa:", companyId);

// Perspectivas
const perspectivesData = [
  { name: "Financeira", color: "#1e3a5f", sortOrder: 1, description: "Objetivos financeiros" },
  { name: "Mercado e Clientes", color: "#7c3aed", sortOrder: 2, description: "Objetivos de mercado e clientes" },
  { name: "Processos", color: "#0891b2", sortOrder: 3, description: "Objetivos de processos internos" },
  { name: "Crescimento e Aprendizado", color: "#c9a227", sortOrder: 4, description: "Objetivos de crescimento e aprendizado" },
];
const perspIds = {};
for (const p of perspectivesData) {
  const { rows } = await conn.query(
    'INSERT INTO perspectives ("companyId", name, description, color, "sortOrder") VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [companyId, p.name, p.description, p.color, p.sortOrder],
  );
  perspIds[p.name] = rows[0].id;
}
console.log("Perspectivas:", perspIds);

// Áreas (ordem da planilha)
const areasData = [
  "GRUPO POLICONTROL",
  "Diretor Adm/Fin",
  "RH",
  "TI",
  "Financeiro",
  "SGI",
  "Diretoria Comercial",
  "Vendas e Marketing",
  "Vendas Externas",
  "Vendas Diretas",
  "Vendas Licitações",
  "Produto/SAC",
  "Desenvolvimento",
  "Diretoria Operacional",
  "Suprimentos",
  "Controle da Qualidade",
  "Assistência Técnica",
  "Produção",
];
const areaIds = {};
for (let i = 0; i < areasData.length; i++) {
  const { rows } = await conn.query(
    'INSERT INTO areas ("companyId", name, "sortOrder") VALUES ($1, $2, $3) RETURNING id',
    [companyId, areasData[i], i + 1],
  );
  areaIds[areasData[i]] = rows[0].id;
}
console.log("Áreas:", Object.keys(areaIds).length);

// Indicadores: [perspectiva, nome, descricao, unidade, tipoEscala]
const HB120 = "higher_better_120";
const HB100 = "higher_better_100";
const LB100 = "lower_better_100";
const LB120 = "lower_better_120";
const TR = "target_range";

const indicatorsData = [
  ["Financeira", "Receita Bruta", "Faturamento Bruto", "currency", HB120],
  ["Financeira", "Margem de Contribuição Total", "Margem de Contribuição Total", "percent", HB120],
  ["Financeira", "Ebitda", "Ebitda", "percent", HB120],
  ["Financeira", "Despesas Indiretas", "Despesas com pessoal + Operacionais", "currency", LB100],
  ["Mercado e Clientes", "Receita Vendas Licitação", "Faturamento Bruto", "currency", HB120],
  ["Mercado e Clientes", "Receita Vendas Externas", "Faturamento Bruto", "currency", HB120],
  ["Mercado e Clientes", "Conversão em Vendas Diretas", "Razão entre as vendas diretas realizadas e o número total de propostas de vendas diretas emitidas", "percent", HB100],
  ["Mercado e Clientes", "Penetração", "Razão entre o número de clientes cadastrados com vendas e o número de clientes do cadastro, em %", "percent", HB100],
  ["Mercado e Clientes", "Cobertura empresas de saneamento", "Razão entre o número de empresas de saneamento com vendas no período e o número de empresas de saneamento existentes nas áreas de atuação do Grupo, em %", "percent", HB100],
  ["Mercado e Clientes", "Cobertura em industrias farmacêuticas", "Razão entre o número de indústrias farmacêuticas com vendas no período e o número de indústrias farmacêuticas existentes nas áreas de atuação do Grupo, em %", "percent", HB100],
  ["Mercado e Clientes", "Exportação", "Razão entre Faturamento Bruto exportação pelo Faturamento Bruto Total em %", "percent", HB120],
  ["Mercado e Clientes", "Lucro Bruto com Licitação", "Lucro Bruto", "currency", HB120],
  ["Processos", "Prazo de Entrega", "Indicador existente da qualidade", "percent", LB120],
  ["Processos", "Reclamação de Clientes", "Número de reclamações de clientes no período", "number", LB120],
  ["Processos", "Qualidade", "Indicador de qualidade", "percent", LB120],
  ["Processos", "Compra de Material Direto", "Razão entre compras realizadas no mês X e o Faturamento Bruto do mês X-1, em %", "percent", TR],
  ["Processos", "Paradas de produção", "Número de paradas de produção por falta de produto (descontinuidade ou problema de qualidade) comprado", "number", LB120],
  ["Processos", "Custo do Frete", "Razão entre o custo do frete e o faturamento bruto, em %", "percent", HB100],
  ["Processos", "Custo do Transporte", "Razão entre o custo do transporte e o faturamento bruto, em %", "percent", HB100],
  ["Processos", "Desenvolvimento", "Razão entre o faturamento de itens desenvolvidos YTD com MC superior a 60% e o Faturamento Bruto YTD, em %", "percent", LB100],
  ["Processos", "Prazo do Desenvolvimento", "Variação do prazo médio dos desenvolvimentos apurados entre o prazo original e o prazo realizado, em %", "percent", HB100],
  ["Crescimento e Aprendizado", "Headcount", "Razão entre Faturamento Bruto e número de colaboradores (considerar CLT, PJ e estagiários)", "number", HB100],
  ["Crescimento e Aprendizado", "Absenteismo Adm Financeiro", "Razão entre as horas médias de ausência da equipe pelo número de horas disponíveis da equipe", "percent", HB100],
  ["Crescimento e Aprendizado", "Absenteismo Comercial", "Razão entre as horas médias de ausência da equipe pelo número de horas disponíveis da equipe", "percent", HB100],
  ["Crescimento e Aprendizado", "Absenteismo Operacional", "Razão entre as horas médias de ausência da equipe pelo número de horas disponíveis da equipe", "percent", HB100],
  ["Crescimento e Aprendizado", "Disponibilidade dos servidores", "Razão entre horas disponíveis dos servidores e a quantidade total de horas úteis do mês", "percent", HB100],
  ["Crescimento e Aprendizado", "Atendimento", "% de atendimento dos chamados de TI no prazo acordado ou qualidade do atendimento avaliada pelo usuário", "percent", HB100],
];
const indIds = {};
for (let i = 0; i < indicatorsData.length; i++) {
  const [persp, name, desc, unit, scale] = indicatorsData[i];
  const { rows } = await conn.query(
    'INSERT INTO indicators ("companyId", "perspectiveId", name, description, unit, "scaleType", "sortOrder") VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
    [companyId, perspIds[persp], name, desc, unit, scale, i + 1],
  );
  indIds[name] = rows[0].id;
}
console.log("Indicadores:", Object.keys(indIds).length);

// Pesos área × perspectiva (extraídos da planilha PESOS)
// [Financeira, Mercado, Processos, Crescimento]
const weightsData = {
  "GRUPO POLICONTROL": [0.5, 0.2, 0.2, 0.1],
  "Diretor Adm/Fin": [0.5, 0.1, 0.2, 0.2],
  RH: [0.5, 0.0, 0.1, 0.4],
  TI: [0.5, 0.0, 0.1, 0.4],
  Financeiro: [0.7, 0.0, 0.05, 0.25],
  SGI: [0.5, 0.0, 0.3, 0.2],
  "Diretoria Comercial": [0.5, 0.3, 0.1, 0.1],
  "Vendas e Marketing": [0.5, 0.3, 0.1, 0.1],
  "Vendas Externas": [0.5, 0.3, 0.1, 0.1],
  "Vendas Diretas": [0.5, 0.3, 0.1, 0.1],
  "Vendas Licitações": [0.5, 0.3, 0.1, 0.1],
  "Produto/SAC": [0.5, 0.0, 0.3, 0.2],
  Desenvolvimento: [0.5, 0.1, 0.3, 0.1],
  "Diretoria Operacional": [0.5, 0.1, 0.3, 0.1],
  Suprimentos: [0.5, 0.1, 0.3, 0.1],
  "Controle da Qualidade": [0.5, 0.1, 0.3, 0.1],
  "Assistência Técnica": [0.5, 0.1, 0.3, 0.1],
  Produção: [0.5, 0.1, 0.3, 0.1],
};
const perspOrder = ["Financeira", "Mercado e Clientes", "Processos", "Crescimento e Aprendizado"];
for (const [areaName, ws] of Object.entries(weightsData)) {
  for (let i = 0; i < 4; i++) {
    await conn.query(
      'INSERT INTO area_perspective_weights ("areaId", "perspectiveId", weight) VALUES ($1, $2, $3)',
      [areaIds[areaName], perspIds[perspOrder[i]], ws[i]],
    );
  }
}
console.log("Pesos inseridos");

// Aplicabilidade indicador × área (matriz da planilha: presença de célula =$G/=$H no bloco)
// Formato: indicador → lista de áreas aplicáveis ("*" = todas)
const A = areasData; // alias
const applicabilityData = {
  "Receita Bruta": "*",
  "Margem de Contribuição Total": "*",
  Ebitda: "*",
  "Despesas Indiretas": "*",
  "Receita Vendas Licitação": ["GRUPO POLICONTROL", "Diretor Adm/Fin", "Diretoria Comercial", "Vendas e Marketing", "Vendas Externas", "Vendas Diretas", "Vendas Licitações", "Desenvolvimento", "Diretoria Operacional", "Suprimentos", "Controle da Qualidade", "Assistência Técnica", "Produção"],
  "Receita Vendas Externas": ["GRUPO POLICONTROL", "Diretor Adm/Fin", "Diretoria Comercial", "Vendas e Marketing", "Vendas Externas", "Desenvolvimento", "Diretoria Operacional", "Suprimentos", "Controle da Qualidade", "Assistência Técnica", "Produção"],
  "Conversão em Vendas Diretas": ["GRUPO POLICONTROL", "Diretoria Comercial", "Vendas e Marketing", "Vendas Diretas", "Desenvolvimento", "Diretoria Operacional", "Suprimentos", "Controle da Qualidade", "Assistência Técnica", "Produção"],
  Penetração: ["GRUPO POLICONTROL", "Diretoria Comercial", "Vendas e Marketing", "Vendas Externas", "Vendas Diretas", "Vendas Licitações"],
  "Cobertura empresas de saneamento": ["GRUPO POLICONTROL", "Diretoria Comercial", "Vendas e Marketing", "Vendas Licitações"],
  "Cobertura em industrias farmacêuticas": ["GRUPO POLICONTROL", "Diretoria Comercial", "Vendas e Marketing", "Vendas Externas"],
  Exportação: ["GRUPO POLICONTROL", "Diretor Adm/Fin", "Diretoria Comercial", "Vendas e Marketing"],
  "Lucro Bruto com Licitação": ["GRUPO POLICONTROL", "Diretor Adm/Fin", "Diretoria Comercial", "Vendas e Marketing", "Vendas Licitações"],
  "Prazo de Entrega": ["GRUPO POLICONTROL", "Diretor Adm/Fin", "RH", "TI", "SGI", "Financeiro", "Diretoria Comercial", "Vendas e Marketing", "Vendas Externas", "Vendas Diretas", "Vendas Licitações", "Produto/SAC", "Desenvolvimento", "Diretoria Operacional", "Suprimentos", "Controle da Qualidade", "Assistência Técnica", "Produção"],
  "Reclamação de Clientes": ["GRUPO POLICONTROL", "Diretoria Comercial", "Vendas e Marketing", "Vendas Externas", "Vendas Diretas", "Vendas Licitações", "Diretoria Operacional", "Suprimentos", "Controle da Qualidade", "Assistência Técnica", "Produção"],
  Qualidade: ["GRUPO POLICONTROL", "Diretor Adm/Fin", "RH", "SGI", "Diretoria Comercial", "Vendas e Marketing", "Vendas Externas", "Vendas Diretas", "Vendas Licitações", "Produto/SAC", "Desenvolvimento", "Diretoria Operacional", "Suprimentos", "Controle da Qualidade", "Assistência Técnica", "Produção"],
  "Compra de Material Direto": ["GRUPO POLICONTROL", "Diretor Adm/Fin", "Financeiro", "Diretoria Operacional", "Suprimentos"],
  "Paradas de produção": ["GRUPO POLICONTROL", "Diretoria Operacional", "Suprimentos"],
  "Custo do Frete": ["GRUPO POLICONTROL", "Diretor Adm/Fin", "Financeiro", "Diretoria Comercial", "Vendas e Marketing", "Vendas Externas", "Vendas Diretas", "Vendas Licitações", "Diretoria Operacional", "Suprimentos"],
  "Custo do Transporte": ["GRUPO POLICONTROL", "Diretor Adm/Fin", "Financeiro", "Diretoria Operacional", "Suprimentos"],
  Desenvolvimento: ["GRUPO POLICONTROL", "Diretoria Comercial", "Desenvolvimento"],
  "Prazo do Desenvolvimento": ["GRUPO POLICONTROL", "Diretoria Comercial", "Vendas Licitações", "Desenvolvimento"],
  Headcount: "*",
  "Absenteismo Adm Financeiro": ["GRUPO POLICONTROL", "Diretor Adm/Fin", "RH", "TI", "Financeiro", "SGI"],
  "Absenteismo Comercial": ["GRUPO POLICONTROL", "RH", "Diretoria Comercial", "Vendas e Marketing", "Vendas Externas", "Vendas Diretas", "Vendas Licitações", "Produto/SAC", "Desenvolvimento"],
  "Absenteismo Operacional": ["GRUPO POLICONTROL", "RH", "Diretoria Operacional", "Suprimentos", "Controle da Qualidade", "Assistência Técnica", "Produção"],
  "Disponibilidade dos servidores": ["GRUPO POLICONTROL", "TI"],
  Atendimento: ["GRUPO POLICONTROL", "TI"],
};
let applCount = 0;
for (const [indName, areasApp] of Object.entries(applicabilityData)) {
  const list = areasApp === "*" ? A : areasApp;
  for (const areaName of list) {
    if (!areaIds[areaName]) continue;
    await conn.query(
      'INSERT INTO indicator_area_applicability ("indicatorId", "areaId", applicable) VALUES ($1, $2, TRUE)',
      [indIds[indName], areaIds[areaName]],
    );
    applCount++;
  }
}
console.log("Aplicabilidade:", applCount);

// Metas e resultados de exemplo (da planilha, período jun/2026)
const YEAR = 2026;
const MONTH = 6;
const entriesData = [
  ["Receita Bruta", 1100000, 1200000],
  ["Margem de Contribuição Total", 0.75, 0.72],
  ["Ebitda", 0.28, 0.3],
  ["Despesas Indiretas", 250000, 260000],
];
for (const [name, goal, result] of entriesData) {
  await conn.query(
    'INSERT INTO indicator_entries ("indicatorId", year, month, goal, result, source) VALUES ($1, $2, $3, $4, $5, \'manual\')',
    [indIds[name], YEAR, MONTH, goal, result],
  );
}
console.log("Lançamentos de exemplo:", entriesData.length);

await conn.end();
console.log("Seed concluído com sucesso.");
