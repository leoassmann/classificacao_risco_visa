# Ferramentas de Classificação de Risco

Este projeto é uma aplicação web que centraliza ferramentas para classificar o risco de atividades econômicas (CNAEs) com base em diferentes legislações. A interface é projetada para ser rápida, intuitiva e responsiva, permitindo que os usuários processem informações de forma eficiente.

## ✨ Funcionalidades Principais

- **Múltiplas Ferramentas**: A página inicial serve como um portal para diferentes classificadores.
- **Entrada Flexível de Dados**: Os usuários podem fornecer os CNAEs de duas maneiras:
  - **Upload de PDF**: Extrai automaticamente os códigos CNAE de um documento PDF.
  - **Entrada de Texto**: Permite colar ou digitar os códigos CNAE diretamente.
- **Processamento Rápido**: Compara os CNAEs fornecidos com uma base de dados interna (um arquivo Excel).
- **Tabela de Resultados Interativa**:
  - Exibe os resultados da classificação de forma clara.
  - **Filtros dinâmicos** por coluna para refinar a busca.
  - **Ordenação** ascendente e descendente por coluna.
  - Destaque de linhas com cores baseadas no nível de risco (Alto, Médio).
- **Exportação de Resultados**: Permite baixar a tabela de resultados como um arquivo `.xlsx` (Excel), mantendo o destaque de cores.
- **Interface Moderna**:
  - Design limpo e responsivo construído com Tailwind CSS.
  - Suporte a tema claro e escuro (Dark Mode).
  - Menu lateral expansível para navegação.

## 🛠️ Ferramentas Implementadas

Atualmente, o projeto inclui duas ferramentas de classificação:

### 1. Classificador VISA/SC

- **Baseado em**: Resolução Normativa da Vigilância Sanitária de Santa Catarina.
- **Arquivo de Dados**: `visa/base de dados.xlsx`
- **Lógica**: Encontra e exibe as atividades da base de dados que correspondem aos CNAEs fornecidos.

### 2. Classificador PMF (Prefeitura de Florianópolis)

- **Baseado em**: Decreto nº 22.143, de 15 de outubro de 2020.
- **Arquivo de Dados**: `pmf/base de dados-pmf.xlsx`
- **Lógica**: Além de encontrar as correspondências, esta ferramenta possui uma regra adicional: qualquer CNAE fornecido que **não** seja encontrado na base de dados é automaticamente classificado como "Alto Risco".

## 🚀 Como Executar o Projeto

Como este é um projeto front-end puro (HTML, CSS, JS), não há necessidade de um processo de build complexo.

1.  **Servidor Web Local**:
    Para que o JavaScript possa carregar os arquivos de base de dados (`.xlsx`) via `fetch`, você precisa servir os arquivos a partir de um servidor web local. Você não pode simplesmente abrir o `index.html` diretamente no navegador a partir do sistema de arquivos (usando `file:///...`).

    Se você tem o Python instalado, pode iniciar um servidor simples:
    ```bash
    # Navegue até a pasta raiz do projeto
    cd /caminho/para/classificacao_risco

    # Inicie o servidor (para Python 3)
    python -m http.server
    ```
    Outra ótima opção é usar a extensão **Live Server** no Visual Studio Code.

2.  **Acesse a Aplicação**:
    Abra seu navegador e acesse o endereço fornecido pelo servidor local (geralmente `http://localhost:8000` ou `http://127.0.0.1:5500` se usar o Live Server).

## 📂 Estrutura de Arquivos

```
classificacao_risco/
├── 📄 index.html             # Página inicial que direciona para as ferramentas
├── 📄 visa.html              # Interface da ferramenta VISA/SC
├── 📄 pmf.html               # Interface da ferramenta PMF
├── 📁 visa/
│   └── 📄 base de dados.xlsx  # Base de dados para a ferramenta VISA/SC
├── 📁 pmf/
│   └── 📄 base de dados-pmf.xlsx # Base de dados para a ferramenta PMF
├── 📜 script.js              # Lógica JavaScript para a ferramenta VISA/SC
├── 📜 script-pmf.js          # Lógica JavaScript para a ferramenta PMF
├── 🎨 style.css              # Estilos CSS personalizados
└── 📄 README.md              # Este arquivo
```

## 💻 Tecnologias Utilizadas

- **HTML5**
- **Tailwind CSS**: Para estilização rápida e responsiva.
- **JavaScript (ES6+)**: Para toda a lógica da aplicação.
- **pdf.js**: Para extrair texto de arquivos PDF no lado do cliente.
- **SheetJS (xlsx)**: Para ler os dados dos arquivos Excel.
- **ExcelJS**: Para gerar e exportar os arquivos Excel de resultados.
- **FileSaver.js**: Para salvar os arquivos gerados no navegador.