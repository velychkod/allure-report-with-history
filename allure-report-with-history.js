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
        const reportsToKeep = parseInt(core.getInput('reports-to-keep') || '20', 10); // 0 = overwrite branch
        const generateIndexHtmlWithHistory = core.getInput('generate-index-html-with-reports-history') !== 'false';
        const ghPagesUrl = core.getInput('gh-pages-url');

        // Repository info
        const { repo, owner } = github.context.repo;
        const tempDir = path.join(process.cwd(), 'temp-allure-reports');
        const tempHistoryDir = path.join(process.cwd(), 'temp-allure-history');

        // Ensure allure binary is executable (fix for Linux)
        const allureBinary = path.join(
            process.cwd(),
            'node_modules',
            'allure-commandline',
            'dist',
            'bin',
            'allure'
        );
        if (fs.existsSync(allureBinary)) {
            fs.chmodSync(allureBinary, 0o755);
            console.log(`Ensured executable permissions for: ${allureBinary}`);
        }

        console.log('Generating Allure report...');
        await new Promise((resolve, reject) => {
            const generation = allureCli(['generate', allureResultsPath, '--clean', '-o', './allure-report']);
            generation.on('exit', (code) => {
                if (code !== 0) {
                    reject(new Error(`Allure generation failed with code ${code}`));
                } else {
                    console.log('Allure report generated successfully');
                    resolve();
                }
            });
        });

        // Prepare temp folder for deployment
        fs.removeSync(tempDir);
        fs.mkdirSync(tempDir);

        // Restore previous history if keeping reports
        if (reportsToKeep > 0) {
            console.log(`Cloning branch ${publishedBranch} to restore history...`);
            fs.removeSync(tempHistoryDir);
            execSync(
                `git clone --single-branch --branch ${publishedBranch} https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/${owner}/${repo}.git ${tempHistoryDir}`,
                { stdio: 'inherit' }
            );

            const historyPath = path.join(tempHistoryDir, 'history');
            if (fs.existsSync(historyPath)) {
                fs.copySync(historyPath, path.join(tempDir, 'history'));
                console.log('Previous history restored.');
            }
        }

        // Archive current report
        let currentReportName = '';
        if (reportsToKeep > 0) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            currentReportName = timestamp;
            const archivePath = path.join(tempDir, timestamp);
            fs.mkdirSync(archivePath, { recursive: true });
            fs.copySync('./allure-report', archivePath);

            // Update last-history
            const lastHistoryPath = path.join(tempDir, 'last-history');
            fs.mkdirSync(lastHistoryPath, { recursive: true });
            const reportHistory = path.join('./allure-report', 'history');
            if (fs.existsSync(reportHistory)) {
                fs.copySync(reportHistory, lastHistoryPath);
            }
        } else {
            currentReportName = 'allure-report';
            fs.copySync('./allure-report', path.join(tempDir, currentReportName));
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
        execSync('git init', { cwd: tempDir });
        execSync('git config user.name "GitHub Actions"', { cwd: tempDir });
        execSync('git config user.email "actions@github.com"', { cwd: tempDir });
        execSync('git add .', { cwd: tempDir });
        execSync(`git commit -m "Deployed Allure report by run ${github.context.runId}"`, { cwd: tempDir });
        execSync(
            `git push -f https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/${owner}/${repo}.git HEAD:${publishedBranch}`,
            { cwd: tempDir }
        );
        console.log('Allure report deployed.');

        // Add link to GitHub Actions run summary if ghPagesUrl is provided
        if (ghPagesUrl) {
            const reportUrl = `${ghPagesUrl.replace(/\/$/, '')}/${currentReportName}/index.html`;
            const summary = `### 📊 [Open Allure Report](${reportUrl})\nThe report will be available after deployment completes.`;
            fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
            console.log(`Added link to run summary: ${reportUrl}`);
        }

    } catch (error) {
        core.setFailed(error.message);
    }
})();
