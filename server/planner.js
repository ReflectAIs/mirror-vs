const fs = require('fs');
const path = require('path');

function updateTask(rootPath, name, status, newTasks = []) {
    const planPath = path.join(rootPath, '.mirror', 'PLAN.md');
    if (!fs.existsSync(planPath)) {
        // If plan doesn't exist, create it with initial structure
        const initial = `# PLAN\n- [ ] ${name}\n`;
        fs.mkdirSync(path.dirname(planPath), { recursive: true });
        fs.writeFileSync(planPath, initial);
        return { status: 'created' };
    }

    let content = fs.readFileSync(planPath, 'utf8');
    const lines = content.split('\n');
    let found = false;

    const statusMap = {
        'todo': '[ ]',
        'progress': '[/]',
        'done': '[x]'
    };
    const marker = statusMap[status] || '[ ]';

    const newContent = lines.map(line => {
        // Match the task line. We escape special chars for a safe regex search.
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`^(\\s*)-\\s+\\[[ \\/x]\\]\\s+${escapedName}\\s*$`, 'i');
        
        if (regex.test(line)) {
            found = true;
            const indent = line.match(/^(\s*)/)[1];
            let replacement = `${indent}- ${marker} ${name}`;
            
            if (newTasks.length > 0) {
                // If expanding one task into sub-tasks
                const subTasks = newTasks.map(t => `${indent}  - [ ] ${t}`).join('\n');
                replacement += '\n' + subTasks;
            }
            return replacement;
        }
        return line;
    }).join('\n');

    if (!found && status === 'todo') {
        // If not found and we are adding a new task, append it to the end
        content += `\n- [ ] ${name}\n`;
        fs.writeFileSync(planPath, content);
        return { status: 'appended' };
    }

    fs.writeFileSync(planPath, newContent);
    return { status: found ? 'updated' : 'not_found' };
}

module.exports = { updateTask };
