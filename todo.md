# Project TODO — Painel de Gestão de Indicadores

## Backend
- [x] Schema do banco: empresas, áreas, perspectivas, indicadores, pesos (área×perspectiva), aplicabilidade (indicador×área), metas/resultados mensais
- [x] Motor de cálculo idêntico à planilha: score por degraus (5 tipos fixos de escala), média por perspectiva × peso, soma das perspectivas = total da área
- [x] Router CRUD empresas
- [x] Router CRUD áreas
- [x] Router CRUD perspectivas
- [x] Router CRUD indicadores (com tipo de escala: maior-melhor 120%, maior-melhor 100%, menor-melhor 100%, menor-melhor 120%, faixa-alvo)
- [x] Matriz de pesos área × perspectiva
- [x] Matriz de aplicabilidade indicador × área
- [x] Metas por indicador por período (mês/ano)
- [x] Lançamento manual de resultados mensais
- [x] Importação Excel (aba INDICADORES, colunas indicador/meta/resultado)
- [x] Endpoints de dashboard (geral, por área, por perspectiva, por indicador, evolução, ranking, heatmap)
- [x] Controle de usuários (admin/usuário) e gerenciamento de acessos
- [x] Testes vitest do motor de cálculo (validados contra valores da planilha)
- [x] Exportação Excel
- [x] Exportação PDF (via impressão do navegador com CSS dedicado)

## Frontend
- [x] Tema visual elegante e sofisticado (tipografia, paleta, dashboard layout)
- [x] Login e controle de acesso por perfil
- [x] Página de cadastro de empresas
- [x] Página de cadastro de áreas
- [x] Página de cadastro de perspectivas
- [x] Página de cadastro de indicadores (com 5 tipos de escala nomeados)
- [x] Página de parametrização de pesos (matriz área × perspectiva)
- [x] Página de aplicabilidade (matriz indicador × área)
- [x] Cadastro de metas e lançamento de resultados combinados na página "Metas e Resultados" (/lancamentos), por indicador e período
- [x] Página de importação Excel
- [x] Dashboard geral (visão consolidada, barras + gauge)
- [x] Dashboard por área
- [x] Dashboard por perspectiva
- [x] Dashboard por indicador
- [x] Evolução mensal (linha histórica por área/perspectiva/indicador)
- [x] Ranking de áreas
- [x] Heatmap indicador × área
- [x] Exportação PDF e Excel nos dashboards
- [x] Página de gerenciamento de usuários (admin)

## Correções de gaps identificados
- [x] Exclusão de empresas com cascade seguro (áreas, perspectivas, indicadores, pesos, aplicabilidade, lançamentos, logs)
- [x] Exclusão de perspectivas com cascade de indicadores e dependências
- [x] Frontend consome snapshot/history para derivar ranking, heatmap e visões filtradas (client-side)

## Dados iniciais
- [x] Seed com dados da planilha (4 perspectivas, 27 indicadores, 18 áreas, pesos e aplicabilidade)
- [x] Teste de importação com a planilha original GESTÃODEINDICADORES.xlsx (aba INDICADORES)

## Novas solicitações (16/07)
- [x] Seleção de áreas vinculadas ao indicador no cadastro de indicadores (dialog), múltipla escolha, visual estilo heatmap

## Novas solicitações (18/07) — Objetivos e Regras de Calibragem
- [x] Schema: tabela objectives (perspectiva → objetivos), indicador vinculado a objetivo
- [x] Schema: tabelas calibration_rules e calibration_rule_ranges (faixas livres: min/max atingimento → score), flag conversão direta
- [x] Seed: 6 regras pré-carregadas da imagem (Regras 1-5 + Conversão Direta)
- [x] Motor de cálculo: score via regra de calibragem dinâmica (faixas) ou conversão direta, substituindo scaleType fixo
- [x] Migração dos indicadores existentes: scaleType → regra equivalente
- [x] Routers CRUD objetivos e regras de calibragem (com faixas)
- [x] Campo meta padrão (defaultGoal) no cadastro de indicador, pré-preenchendo lançamentos (editável mês a mês)
- [x] Página de cadastro de objetivos (hierarquia perspectivas → objetivos)
- [x] Página de cadastro de regras de calibragem (editor de faixas livre)
- [x] Cadastro de indicadores: substituir "Tipo de escala" por seleção de regra de calibragem + seleção de objetivo
- [x] Tela de lançamentos: colunas Meta (pré-preenchida editável), Resultado, Regra aplicada, Score calculado
- [x] Ajustar dashboards/exportações para a nova hierarquia e regras (dashboardService usa regras)
- [x] Testes vitest do novo motor de cálculo com as 6 regras (30 testes passando)

## Novas solicitações (18/07 — parte 2) — Hierarquia de áreas e organograma
- [x] Schema: coluna parentAreaId em areas (auto-referência)
- [x] Cadastro de áreas: campo "Subordinada a" (área-pai)
- [x] Dashboard organograma: árvore hierárquica com score de cada área no período
- [x] Filtros multi-seleção (checkboxes) de áreas para ver resultados juntos ou separados (diretoria + subordinados)
- [x] Validação backend: impedir ciclos indiretos na hierarquia (A→B→A) e área-pai de outra empresa
- [x] Testes vitest da hierarquia de áreas (ciclos e empresa) — 36 testes passando
