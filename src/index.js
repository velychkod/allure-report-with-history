const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');
const allureCli = require('allure-commandline');

(async () => {
    try {
        // Read inputs
        const allureResultsPath = core.getInput('allure-results-source', { required: true });
        const publishedBranch = core.getInput('published-reports-branch', { required: true });
        const reportsToKeep = parseInt(core.getInput('reports-to-keep') || '20', 10);
        const generateIndexHtmlWithHistory = core.getInput('generate-index-html-with-reports-history') !== 'false';
        const ghPagesUrl = core.getInput('gh-pages-url');

        const repo = github.context.repo.repo;
        const owner = github.context.repo.owner;
        const tempDir = path.join(process.cwd(), 'temp-allure-reports');

        // Generate Allure report
        console.log('Generating Allure report...');
        const generation = allureCli(['generate', allureResultsPath, '--clean', '-o', './allure-report']);
        generation.on('exit', exitCode => {
            if (exitCode !== 0) {
                core.setFailed(`Allure generation failed with code ${exitCode}`);
                return;
            }
            console.log('Allure report generated successfully');
        });

        // Prepare temp folder
        fs.removeSync(tempDir);
        fs.mkdirSync(tempDir);
        fs.copySync('./allure-report', tempDir);

        // Clone history if reportsToKeep > 0
        if (reportsToKeep > 0) {
            const tempHistoryDir = `${tempDir}-history`;
            console.log(`Cloning branch ${publishedBranch}...`);
            execSync(`git clone --single-branch --branch ${publishedBranch} https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/${owner}/${repo}.git ${tempHistoryDir}`);
            const historyPath = path.join(tempHistoryDir, 'history');
            if (fs.existsSync(historyPath)) {
                fs.copySync(historyPath, path.join(tempDir, 'history'));
                console.log('Previous history restored.');
            }
        }

        // Archive report with timestamp
        if (reportsToKeep > 0) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const archivePath = path.join(tempDir, timestamp);
            fs.mkdirSync(archivePath, { recursive: true });
            fs.copySync('./allure-report', archivePath);

            const lastHistoryPath = path.join(tempDir, 'last-history');
            fs.mkdirSync(lastHistoryPath, { recursive: true });
            if (fs.existsSync(path.join('./allure-report', 'history'))) {
                fs.copySync(path.join('./allure-report', 'history'), lastHistoryPath);
            }
        }

        // Generate index.html if requested
        if (generateIndexHtmlWithHistory) {
            console.log('Generating index.html with reports history...');
            const indexFile = path.join(tempDir, 'index.html');
            const reportDirs = fs.readdirSync(tempDir, { withFileTypes: true })
                .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/.test(d.name))
                .sort((a, b) => b.name.localeCompare(a.name));
            const links = reportDirs.map(d => `<li><a href='./${d.name}/index.html' target='_blank'>Report from ${d.name}</a></li>`).join('\n');
            const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset='UTF-8'>
<title>Allure Reports Archive</title>
<style>body { font-family: Arial, sans-serif; padding: 20px; } li { margin: 0.5rem 0; }</style>
</head>
<body>
<h1>Allure Reports Archive</h1>
<ul>
${links}
</ul>
</body>
</html>`;
            fs.writeFileSync(indexFile, html, 'utf8');
        }

        // Commit and push to published branch
        console.log(`Deploying Allure report to branch ${publishedBranch}...`);
        execSync(`git init`, { cwd: tempDir });
        execSync(`git config user.name "GitHub Actions"`, { cwd: tempDir });
        execSync(`git config user.email "actions@github.com"`, { cwd: tempDir });
        execSync(`git add .`, { cwd: tempDir });
        execSync(`git commit -m "Deployed Allure report by run ${github.context.runId}"`, { cwd: tempDir });
        execSync(`git push -f https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/${owner}/${repo}.git HEAD:${publishedBranch}`, { cwd: tempDir });
        console.log('Allure report deployed.');

        // Add link to run summary
        if (ghPagesUrl) {
            const reportDirs = fs.readdirSync(tempDir, { withFileTypes: true })
                .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/.test(d.name))
                .sort((a, b) => b.name.localeCompare(a.name));
            if (reportDirs.length > 0) {
                const latestReport = reportDirs[0].name;
                const reportUrl = `${ghPagesUrl.replace(/\/$/, '')}/${latestReport}/index.html`;
                const summary = `### 📊 [Open Allure Report](${reportUrl})\nThe report will be available after deployment completes.`;
                fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
                console.log(`Added link to run summary: ${reportUrl}`);
            }
        }

    } catch (error) {
        core.setFailed(error.message);
    }
})();
