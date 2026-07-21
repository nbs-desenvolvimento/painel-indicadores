CREATE TABLE `area_perspective_weights` (
	`id` int AUTO_INCREMENT NOT NULL,
	`areaId` int NOT NULL,
	`perspectiveId` int NOT NULL,
	`weight` double NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `area_perspective_weights_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_area_persp` UNIQUE(`areaId`,`perspectiveId`)
);
--> statement-breakpoint
CREATE TABLE `areas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `areas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `companies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`cnpj` varchar(32),
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `import_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`fileName` varchar(512),
	`totalRows` int NOT NULL DEFAULT 0,
	`matchedRows` int NOT NULL DEFAULT 0,
	`unmatchedRows` text,
	`importedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `import_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `indicator_area_applicability` (
	`id` int AUTO_INCREMENT NOT NULL,
	`indicatorId` int NOT NULL,
	`areaId` int NOT NULL,
	`applicable` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `indicator_area_applicability_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ind_area` UNIQUE(`indicatorId`,`areaId`)
);
--> statement-breakpoint
CREATE TABLE `indicator_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`indicatorId` int NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`goal` double,
	`result` double,
	`source` enum('manual','import') NOT NULL DEFAULT 'manual',
	`updatedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `indicator_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_ind_period` UNIQUE(`indicatorId`,`year`,`month`)
);
--> statement-breakpoint
CREATE TABLE `indicators` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`perspectiveId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`unit` varchar(32) DEFAULT 'number',
	`scaleType` enum('higher_better_120','higher_better_100','lower_better_100','lower_better_120','target_range') NOT NULL DEFAULT 'higher_better_100',
	`sortOrder` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `indicators_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `perspectives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`color` varchar(16) DEFAULT '#1e3a5f',
	`sortOrder` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `perspectives_id` PRIMARY KEY(`id`)
);
