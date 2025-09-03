const core = require('@actions/core');
const github = require('@actions/github');
const fs = require('fs-extra');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
const os = require('os');

const allureResultsPath = core.getInput('allure-results-source', { required: true });
const publishedBranch = core.getInput('published-reports-branch', { required: true });
const reportsToKeep = parseInt(core.getInput('reports-to-keep') || '20', 10);
const generateIndexHtmlWithHistory = core.getInput('generate-index-html-with-reports-history') !== 'false';
const ghPagesUrl = core.getInput('gh-pages-url');

const repo = github.context.repo.repo;
const owner = github.context.repo.owner;
const tempDir = path.join(process.cwd(), 'temp-allure-reports');

// Install Allure dynamically
function installAllure() {
    console.log('Installing Allure...');
    if (os.platform() === 'win32') {
        execSync('choco install allure -y', { stdio: 'inherit' });
        return 'allure';
    } else {
        execSync('sudo apt-get update && sudo apt-get install -y wget unzip openjdk-11-jre', { stdio: 'inherit' });
        const tmpDir = path.join(os.tmpdir(), 'allure');
        fs.ensureDirSync(tmpDir);
        execSync(`wget -qO ${tmpDir}/allure.zip https://github.com/allure-framework/allure2/releases/download/2.25.0/allure-2.25.0.zip`, { stdio: 'inherit' });
        execSync(`unzip -q -o ${tmpDir}/allure.zip -d ${tmpDir}`, { stdio: 'inherit' });
        const allurePath = path.join(tmpDir, 'allure-2.25.0', 'bin', 'allure');
        execSync(`chmod +x ${allurePath}`);
        return allurePath;
    }
}

(async () => {
    try {
        const isWindows = os.platform() === 'win32';
        console.log(`Running on ${isWindows ? 'Windows' : 'Linux/macOS'}`);

        const allureBinary = installAllure();
        console.log(`Using Allure binary: ${allureBinary}`);

        // Generate new report
        console.log('Generating Allure report...');
        execFileSync(allureBinary, ['generate', allureResultsPath, '--clean', '-o', './allure-report'], { stdio: 'inherit' });

        if (!fs.existsSync('./allure-report')) throw new Error('Allure report generation failed.');

        console.log('Allure report generated successfully.');

        // Prepare deployment folder
        fs.removeSync(tempDir);
        fs.mkdirSync(tempDir);

        // Clone branch with previous reports
        console.log(`Cloning branch ${publishedBranch} to preserve history...`);
        const tempHistoryDir = `${tempDir}-history`;
        execSync(
            `git clone --single-branch --branch ${publishedBranch} https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/${owner}/${repo}.git ${tempHistoryDir}`,
            { stdio: 'inherit' }
        );

        // Copy old reports (up to reportsToKeep-1)
        const oldReports = fs.readdirSync(tempHistoryDir, { withFileTypes: true })
            .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/.test(d.name))
            .sort((a, b) => b.name.localeCompare(a.name))
            .slice(0, reportsToKeep - 1);

        oldReports.forEach(report => {
            fs.copySync(path.join(tempHistoryDir, report.name), path.join(tempDir, report.name));
        });

        // Add new report
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const newReportPath = path.join(tempDir, timestamp);
        fs.copySync('./allure-report', newReportPath);

        // Generate index.html
        if (generateIndexHtmlWithHistory) {
            console.log('Generating index.html...');
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
            fs.writeFileSync(path.join(tempDir, 'index.html'), html, 'utf8');
        }

        // Deploy to branch
        console.log(`Deploying Allure report to branch ${publishedBranch}...`);
        execSync('git init', { cwd: tempDir });
        execSync('git config user.name "GitHub Actions"', { cwd: tempDir });
        execSync('git config user.email "actions@github.com"', { cwd: tempDir });
        execSync('git add .', { cwd: tempDir });
        execSync(`git commit -m "Deployed Allure report by run ${github.context.runId}"`, { cwd: tempDir });
        execSync(`git push -f https://x-access-token:${process.env.GITHUB_TOKEN}@github.com/${owner}/${repo}.git HEAD:${publishedBranch}`, { cwd: tempDir });

        console.log('Allure report deployed successfully.');

        // Add summary link
        if (ghPagesUrl) {
            const reportDirs = fs.readdirSync(tempDir, { withFileTypes: true })
                .filter(d => d.isDirectory() && /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}/.test(d.name))
                .sort((a, b) => b.name.localeCompare(a.name));

            if (reportDirs.length > 0) {
                const latestReport = reportDirs[0].name;
                const reportUrl = `${ghPagesUrl.replace(/\/$/, '')}/${latestReport}/index.html`;
                fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
                    `### 📊 [Open Allure Report](${reportUrl})\nThe report will be available after deployment completes.`
                );
                console.log(`Added link to run summary: ${reportUrl}`);
            }
        }

    } catch (error) {
        core.setFailed(error.message);
    }
})();
