CREATE TABLE `calibration_rule_ranges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ruleId` int NOT NULL,
	`minAttainment` double,
	`minInclusive` boolean NOT NULL DEFAULT true,
	`maxAttainment` double,
	`maxInclusive` boolean NOT NULL DEFAULT false,
	`score` double NOT NULL DEFAULT 0,
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `calibration_rule_ranges_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `calibration_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`directConversion` boolean NOT NULL DEFAULT false,
	`sortOrder` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `calibration_rules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `objectives` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyId` int NOT NULL,
	`perspectiveId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `objectives_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `indicators` ADD `objectiveId` int;--> statement-breakpoint
ALTER TABLE `indicators` ADD `calibrationRuleId` int;--> statement-breakpoint
ALTER TABLE `indicators` ADD `defaultGoal` double;