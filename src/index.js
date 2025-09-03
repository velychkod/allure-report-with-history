const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs-extra');
const path = require('path');
const { execFileSync, execSync } = require('child_process');
const allure = require('allure-commandline');

const allureResultsPath = core.getInput('allure-results-source', { required: true });
const publishedBranch = core.getInput('published-reports-branch', { required: true });
const reportsToKeep = parseInt(core.getInput('reports-to-keep') || '20', 10);
const generateIndexHtmlWithHistory = core.getInput('generate-index-html-with-reports-history') !== 'false';
const ghPagesUrl = core.getInput('gh-pages-url');

const repo = github.context.repo.repo;
const owner = github.context.repo.owner;
const tempDir = path.join(process.cwd(), 'temp-allure-reports');

(async () => {
    try {
        console.log('Detecting OS...');
        const isWindows = process.platform === 'win32';
        console.log(`Running on ${isWindows ? 'Windows' : 'Linux/macOS'}`);

        // Detect correct allure binary
        const allureBinary = isWindows ? `${allure.path}.bat` : allure.path;
        console.log(`Using Allure binary: ${allureBinary}`);

        // Generate the Allure report
        console.log('Generating Allure report...');
        execFileSync(allureBinary, ['generate', allureResultsPath, '--clean', '-o', './allure-report'], {
            stdio: 'inherit',
        });

        if (!fs.existsSync('./allure-report')) {
            throw new Error('Allure report generation failed: ./allure-report directory not found.');
        }

        console.log('Allure report generated successfully.');

        // Prepare deployment directory
        fs.removeSync(tempDir);
        fs.mkdirSync(tempDir);
        fs.copySync('./allure-report', tempDir);

        // Preserve report history
        if (reportsToKeep > 0) {
            console.log(`Cloning branch ${publishedBranch} to preserve history...`);
            const tempHistoryDir = `${tempDir}-history`;
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

        // Archive reports if keeping multiple
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

        // Create index.html with report archive links
        if (generateIndexHtmlWithHistory) {
            console.log('Generating index.html with reports history...');
            const indexFile = path.join(tempDir, 'index.html');
            const reportDirs = fs.readdirSync(tempDir, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/.test(dirent.name))
                .sort((a, b) => b.name.localeCompare(a.name));

            const links = reportDirs
                .map(d => `<li><a href='./${d.name}/index.html' target='_blank'>Report from ${d.name}</a></li>`)
                .join('\n');

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

        // Deploy to the branch
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

        // Add a summary link to the job
        if (ghPagesUrl) {
            const reportDirs = fs.readdirSync(tempDir, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/.test(dirent.name))
                .sort((a, b) => b.name.localeCompare(a.name));

            if (reportDirs.length > 0) {
                const latestReport = reportDirs[0].name;
                const reportUrl = `${ghPagesUrl.replace(/\/$/, '')}/${latestReport}/index.html`;
                const summary = `### 📊 [Open Allure Report](${reportUrl})\nThe report will be available after deployment completes.`;
                fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
                console.log(`Added link to run summary: ${reportUrl}`);
            } else {
                console.log('No report folder found to link in run summary.');
            }
        }

    } catch (error) {
        core.setFailed(error.message);
    }
})();
