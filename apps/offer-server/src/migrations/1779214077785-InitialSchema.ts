import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1779214077785 implements MigrationInterface {
    name = 'InitialSchema1779214077785'

    public async up(queryRunner: QueryRunner): Promise<void> {
        const hasTable = await queryRunner.hasTable('user');
        if (hasTable) {
            return;
        }

        await queryRunner.query(`CREATE TABLE \`permissions\` (\`id\` int NOT NULL AUTO_INCREMENT, \`code\` varchar(20) NOT NULL COMMENT '权限代码', \`description\` varchar(100) NOT NULL COMMENT '权限描述', PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`roles\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(20) NOT NULL COMMENT '角色名', PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`upload_file\` (\`id\` int NOT NULL AUTO_INCREMENT, \`userId\` int NOT NULL COMMENT '用户ID', \`username\` varchar(100) NOT NULL COMMENT '用户名', \`filename\` varchar(500) NOT NULL COMMENT '文件名', \`fileType\` varchar(20) NOT NULL COMMENT '文件类型', \`sectionCount\` int NOT NULL COMMENT '分割部分数' DEFAULT '0', \`chunkCount\` int NOT NULL COMMENT '向量块数' DEFAULT '0', \`content\` longtext NULL COMMENT '解析后的完整内容(JSON)', \`filePath\` varchar(500) NULL COMMENT '文件存储路径', \`uploadTime\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_4cd0cae97752673f0c17addca2\` (\`userId\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`user\` (\`id\` int NOT NULL AUTO_INCREMENT, \`username\` varchar(50) NOT NULL COMMENT '用户名', \`password\` varchar(50) NOT NULL COMMENT '密码', \`email\` varchar(50) NOT NULL COMMENT '邮箱', \`headPic\` varchar(100) NULL COMMENT '头像', \`status\` int NOT NULL COMMENT '用户状态' DEFAULT '1', \`inviteCode\` varchar(36) NULL COMMENT '面试邀请码(UUID)', \`createTime\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updateTime\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`IDX_78a916df40e02a9deb1c4b75ed\` (\`username\`), UNIQUE INDEX \`IDX_e12875dfb3b1d92d7d7c5377e2\` (\`email\`), UNIQUE INDEX \`IDX_327b3d13907d1e1dbdd6958743\` (\`inviteCode\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`github_knowledge\` (\`id\` int NOT NULL AUTO_INCREMENT, \`userId\` int NOT NULL COMMENT '上传用户ID', \`username\` varchar(100) NOT NULL COMMENT 'GitHub 用户名（被扫描的账号）', \`repo\` varchar(200) NOT NULL COMMENT '仓库全名 owner/repo', \`description\` varchar(500) NULL COMMENT '仓库描述', \`language\` varchar(50) NULL COMMENT '主要语言', \`topics\` text NULL COMMENT '标签(JSON数组)', \`html_url\` varchar(500) NOT NULL COMMENT '仓库链接', \`readme\` longtext NULL COMMENT 'README 原文', \`chunkCount\` int NOT NULL COMMENT '向量块数' DEFAULT '0', \`uploadTime\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`IDX_bc6706218f326d5230c483431f\` (\`userId\`), UNIQUE INDEX \`uk_user_repo\` (\`userId\`, \`repo\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`role_permissions\` (\`rolesId\` int NOT NULL, \`permissionsId\` int NOT NULL, INDEX \`IDX_0cb93c5877d37e954e2aa59e52\` (\`rolesId\`), INDEX \`IDX_d422dabc78ff74a8dab6583da0\` (\`permissionsId\`), PRIMARY KEY (\`rolesId\`, \`permissionsId\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`user_roles\` (\`userId\` int NOT NULL, \`rolesId\` int NOT NULL, INDEX \`IDX_472b25323af01488f1f66a06b6\` (\`userId\`), INDEX \`IDX_13380e7efec83468d73fc37938\` (\`rolesId\`), PRIMARY KEY (\`userId\`, \`rolesId\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`upload_file\` ADD CONSTRAINT \`FK_4cd0cae97752673f0c17addca27\` FOREIGN KEY (\`userId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`github_knowledge\` ADD CONSTRAINT \`FK_bc6706218f326d5230c483431f0\` FOREIGN KEY (\`userId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`role_permissions\` ADD CONSTRAINT \`FK_0cb93c5877d37e954e2aa59e52c\` FOREIGN KEY (\`rolesId\`) REFERENCES \`roles\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`role_permissions\` ADD CONSTRAINT \`FK_d422dabc78ff74a8dab6583da02\` FOREIGN KEY (\`permissionsId\`) REFERENCES \`permissions\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`user_roles\` ADD CONSTRAINT \`FK_472b25323af01488f1f66a06b67\` FOREIGN KEY (\`userId\`) REFERENCES \`user\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE \`user_roles\` ADD CONSTRAINT \`FK_13380e7efec83468d73fc37938e\` FOREIGN KEY (\`rolesId\`) REFERENCES \`roles\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`user_roles\` DROP FOREIGN KEY \`FK_13380e7efec83468d73fc37938e\``);
        await queryRunner.query(`ALTER TABLE \`user_roles\` DROP FOREIGN KEY \`FK_472b25323af01488f1f66a06b67\``);
        await queryRunner.query(`ALTER TABLE \`role_permissions\` DROP FOREIGN KEY \`FK_d422dabc78ff74a8dab6583da02\``);
        await queryRunner.query(`ALTER TABLE \`role_permissions\` DROP FOREIGN KEY \`FK_0cb93c5877d37e954e2aa59e52c\``);
        await queryRunner.query(`ALTER TABLE \`github_knowledge\` DROP FOREIGN KEY \`FK_bc6706218f326d5230c483431f0\``);
        await queryRunner.query(`ALTER TABLE \`upload_file\` DROP FOREIGN KEY \`FK_4cd0cae97752673f0c17addca27\``);
        await queryRunner.query(`DROP INDEX \`IDX_13380e7efec83468d73fc37938\` ON \`user_roles\``);
        await queryRunner.query(`DROP INDEX \`IDX_472b25323af01488f1f66a06b6\` ON \`user_roles\``);
        await queryRunner.query(`DROP TABLE \`user_roles\``);
        await queryRunner.query(`DROP INDEX \`IDX_d422dabc78ff74a8dab6583da0\` ON \`role_permissions\``);
        await queryRunner.query(`DROP INDEX \`IDX_0cb93c5877d37e954e2aa59e52\` ON \`role_permissions\``);
        await queryRunner.query(`DROP TABLE \`role_permissions\``);
        await queryRunner.query(`DROP INDEX \`uk_user_repo\` ON \`github_knowledge\``);
        await queryRunner.query(`DROP INDEX \`IDX_bc6706218f326d5230c483431f\` ON \`github_knowledge\``);
        await queryRunner.query(`DROP TABLE \`github_knowledge\``);
        await queryRunner.query(`DROP INDEX \`IDX_327b3d13907d1e1dbdd6958743\` ON \`user\``);
        await queryRunner.query(`DROP INDEX \`IDX_e12875dfb3b1d92d7d7c5377e2\` ON \`user\``);
        await queryRunner.query(`DROP INDEX \`IDX_78a916df40e02a9deb1c4b75ed\` ON \`user\``);
        await queryRunner.query(`DROP TABLE \`user\``);
        await queryRunner.query(`DROP INDEX \`IDX_4cd0cae97752673f0c17addca2\` ON \`upload_file\``);
        await queryRunner.query(`DROP TABLE \`upload_file\``);
        await queryRunner.query(`DROP TABLE \`roles\``);
        await queryRunner.query(`DROP TABLE \`permissions\``);
    }

}
