const { exec } = require("child_process");

// Taille maximale autorisée en Mo
const MAX_SIZE_MB = 50;

// Augmenter le tampon pour éviter les erreurs liées à la taille
const execOptions = { maxBuffer: 1024 * 1024 * 1024 }; // 1 GB

exec(
  `git rev-list --objects --all | git cat-file --batch-check="%(objectname) %(objecttype) %(rest)"`,
  execOptions,
  (err, stdout, stderr) => {
    if (err) {
      console.error(`Erreur : ${err.message}`);
      return;
    }

    if (stderr) {
      console.error(`Erreur secondaire : ${stderr}`);
      return;
    }

    const files = stdout
      .split("\n")
      .map((line) => {
        const parts = line.split(" ");
        if (parts.length >= 3) {
          const size = parseInt(parts[2], 10);
          if (!isNaN(size) && size > MAX_SIZE_MB * 1024 * 1024) {
            return { hash: parts[0], path: parts.slice(3).join(" ") };
          }
        }
        return null;
      })
      .filter(Boolean);

    if (files.length === 0) {
      console.log("Aucun fichier volumineux trouvé.");
      return;
    }

    console.log("Fichiers volumineux détectés :");
    files.forEach((file) => console.log(`${file.hash} - ${file.path}`));

    // Supprimez les fichiers volumineux
    files.forEach((file) => {
      exec(
        `git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch "${file.path}"' --prune-empty --tag-name-filter cat -- --all`,
        execOptions,
        (err) => {
          if (err) {
            console.error(`Erreur lors de la suppression de ${file.path}: ${err.message}`);
          } else {
            console.log(`Fichier supprimé de l'historique : ${file.path}`);
          }
        }
      );
    });
  }
);
