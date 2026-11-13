const express = require("express");
const jwt = require("jsonwebtoken");

async function initializeSafetyReports(db) {
  await db.raw(`
    CREATE TABLE IF NOT EXISTS safety_reports (
      id BIGSERIAL PRIMARY KEY,
      reporter_id INTEGER NOT NULL,
      target TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      resolution TEXT
    )
  `);

  await db.raw(`
    CREATE INDEX IF NOT EXISTS safety_reports_reporter_date_idx
    ON safety_reports (reporter_id, created_at DESC)
  `);
}

function createSafetyReportsRouter(db) {
  const router = express.Router();

  router.post("/", async (req, res) => {
    res.set("Cache-Control", "no-store");

    const authorization = req.get("Authorization") || "";

    if (!authorization.startsWith("Bearer ")) {
      return res.status(401).json({
        error: "Reconnecte-toi pour envoyer ton signalement.",
      });
    }

    let userId;

    try {
      const payload = jwt.verify(
        authorization.slice(7),
        process.env.JWT_SECRET,
        { algorithms: ["HS256"] }
      );

      userId = Number(payload.id);

      if (!Number.isSafeInteger(userId) || userId <= 0) {
        throw new Error("Identifiant invalide");
      }
    } catch {
      return res.status(401).json({
        error: "Session expirée. Reconnecte-toi.",
      });
    }

    const target =
      typeof req.body?.target === "string" ? req.body.target.trim() : "";

    const description =
      typeof req.body?.description === "string"
        ? req.body.description.trim()
        : "";

    if (
      target.length < 2 ||
      target.length > 500 ||
      description.length < 10 ||
      description.length > 3000
    ) {
      return res.status(400).json({
        error:
          "Indique le compte ou contenu concerné (2 à 500 caractères) " +
          "et une description de 10 à 3 000 caractères.",
      });
    }

    try {
      const result = await db.transaction(async (trx) => {
        // Sérialise les demandes d'un même utilisateur, même avec
        // plusieurs instances du serveur.
        await trx.raw(
          "SELECT pg_advisory_xact_lock(?, ?)",
          [741029, userId]
        );

        const user = await trx("users").where({ id: userId }).first("id");

        if (!user) {
          return { status: 401 };
        }

        const recent = await trx("safety_reports")
          .where({ reporter_id: userId })
          .where(
            "created_at",
            ">",
            trx.raw("NOW() - INTERVAL '30 seconds'")
          )
          .first("id");

        if (recent) {
          return { status: 429 };
        }

        const [report] = await trx("safety_reports")
          .insert({
            reporter_id: userId,
            target,
            description,
          })
          .returning(["id"]);

        return { status: 201, id: report.id };
      });

      if (result.status === 401) {
        return res.status(401).json({
          error: "Compte introuvable. Reconnecte-toi.",
        });
      }

      if (result.status === 429) {
        res.set("Retry-After", "30");
        return res.status(429).json({
          error: "Attends 30 secondes avant un nouveau signalement.",
        });
      }

      // Ne pas écrire le contenu du signalement dans les logs.
      console.info("[Sécurité] Nouveau signalement :", result.id);

      return res.status(201).json({
        ok: true,
        reference: String(result.id),
      });
    } catch (error) {
      console.error(
        "[Sécurité] Enregistrement impossible :",
        error.code || error.name
      );

      return res.status(500).json({
        error: "Signalement non enregistré. Réessaie dans quelques instants.",
      });
    }
  });

  return router;
}

module.exports = {
  initializeSafetyReports,
  createSafetyReportsRouter,
};