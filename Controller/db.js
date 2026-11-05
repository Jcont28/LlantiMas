
const sql = require("mssql");

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    port: Number(process.env.DB_PORT || 1433),
    options: {
        encrypt: true,
        trustServerCertificate: false
    },
    connectionTimeout: 30000,
    requestTimeout: 30000
};

// Reutilizar una sola conexión en todas las rutas
let poolPromise;

async function conn() {
    if (!process.env.DB_SERVER ||
        !process.env.DB_DATABASE ||
        !process.env.DB_USER ||
        !process.env.DB_PASSWORD) {
        throw new Error("Faltan variables de entorno para conectar a SQL Server");
    }

    if (!poolPromise) {
        poolPromise = sql.connect(config)
            .then(pool => {
                console.log("Base de datos conectada correctamente");
                return pool;
            })
            .catch(error => {
                poolPromise = null;
                console.error("Error al conectar a la base de datos:", error);
                throw error;
            });
    }

    return poolPromise;
}

module.exports = {
    sql,
    conn
};
