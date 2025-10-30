# 📊 Allure Report with history

A GitHub Action to **generate and deploy Allure reports** with optional history and `index.html` for GitHub Pages. It works on any platform (Windows/Linux) where Node.js is available.

This action allows you to keep a history of test reports, automatically generate `executor.json`, and optionally generate `index.html` with links to previous reports.

## Features

- Generate Allure report from downloaded artifact.
- Uses Allure Report version 2.35.1.
- Preserve previous reports (configurable number to keep).
- Automatically generate index.html with links to previous reports.
- Deploy to a specified branch.
- Automatically add a link to the latest report in the GitHub Actions run summary.
- Works on Windows and Linux runners.

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `allure-results-path` | Path to Allure results directory | Yes | - |
| `deploy-branch` | Branch to publish Allure reports | Yes | - |
| `reports-to-keep` | Number of reports to keep in archive | No | `20` |
| `gen-index` | Whether to generate index.html with links to previous reports | No | `true` |
| `gh-pages-url` | Base URL where reports are hosted | No | - |
| `git-user-name` | Git user name for commits | No | `github-actions` |
| `git-user-email` | Git user email for commits | No | `actions@github.com` |
| `report-name` | Custom name for the report | No | `Allure Report MM/DD/YYYY` |


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
        uses: velychkod/allure-report-with-history@main
        with:
          allure-results-path: './allure-results'
          deploy-branch: 'allure-reports'
          reports-to-keep: 10
          gen-index: true
          gh-pages-url: 'https://username.github.io/repo-name'
          report-name: 'My Test Suite'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## 📸 Example Reports

<p align="center">
  <img src="assets/allure-report.png" alt="Allure Report Example" width="400" style="margin:10px;">
  <img src="assets/allure-reports-branch.png" alt="Branch to publish Allure reports" width="400" style="margin:10px;">
  <img src="assets/allure-reports-archive.png" alt="index.html with links to previous reports" width="400" style="margin:10px;">
</p>
