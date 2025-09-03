# Allure Report with History

A GitHub Action to **generate and deploy Allure reports** with optional history and `index.html` for GitHub Pages. It works on any platform (Windows/Linux) where Node.js is available.

This action allows you to keep a history of test reports, automatically generate `executor.json`, and optionally create an index page with links to past reports.  

---

## Features

- Generate Allure report from a folder or downloaded artifact.
- Preserve previous reports and history.
- Automatically update `index.html` with links to all reports.
- Deploy to a specified branch.
- Add link to report in GitHub Actions run summary.

---

## Usage

### Example Workflow

```yaml
name: Allure Report Example
on:
  workflow_dispatch:

jobs:
  generate-and-deploy-report:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v3

      - name: Download Allure results artifact
        uses: actions/download-artifact@v4
        with:
          name: allure-results
          path: ./allure-results

      - name: Generate and deploy Allure report
        uses: ./allure-report-with-history
        with:
          allure-results-source: './allure-results'
          published-reports-branch: 'allure-reports'
          report-name: 'My Test Suite'
          reports-to-keep: 20
          generate-index-html-with-reports-history: true
          gh-pages-url: 'https://username.github.io/repo-name'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
