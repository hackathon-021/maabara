-- CreateTable
CREATE TABLE "groups" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "description" TEXT NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sub_categories" (
    "id" SERIAL NOT NULL,
    "category_id" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sub_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "location_id" INTEGER,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "room_manager" TEXT,
    "start_mapping_time" TIMESTAMP(3),
    "end_mapping_time" TIMESTAMP(3),
    "is_available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mapping_reports" (
    "id" SERIAL NOT NULL,
    "room_id" INTEGER NOT NULL,
    "sub_category_id" INTEGER NOT NULL,
    "reported_by" VARCHAR(10) NOT NULL,
    "reported_on" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(30) NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "serial" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "mapping_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "identity_num" VARCHAR(10),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packing_units" (
    "id" SERIAL NOT NULL,
    "code" CHAR(5),
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "source_room_id" INTEGER NOT NULL,
    "dest_building" TEXT,
    "dest_floor" TEXT,
    "dest_room" TEXT,
    "transport_unit_id" INTEGER,
    "packed_by" INTEGER NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "packing_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "packing_unit_items" (
    "id" SERIAL NOT NULL,
    "packing_unit_id" INTEGER NOT NULL,
    "mapping_report_id" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "distributed_quantity" INTEGER NOT NULL DEFAULT 0,
    "item_status" TEXT NOT NULL DEFAULT 'packed',

    CONSTRAINT "packing_unit_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transport_units" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "type_details" TEXT,
    "license_plate" TEXT NOT NULL,
    "group_id" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'loading',
    "created_by" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "departed_at" TIMESTAMP(3),
    "released_at" TIMESTAMP(3),

    CONSTRAINT "transport_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "status_events" (
    "id" SERIAL NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "from_status" TEXT,
    "to_status" TEXT NOT NULL,
    "actor_id" INTEGER NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "status_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" SERIAL NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'sms',
    "recipients" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "packing_units_code_key" ON "packing_units"("code");

-- CreateIndex
CREATE INDEX "packing_units_status_idx" ON "packing_units"("status");

-- CreateIndex
CREATE INDEX "packing_units_source_room_id_idx" ON "packing_units"("source_room_id");

-- CreateIndex
CREATE UNIQUE INDEX "packing_unit_items_packing_unit_id_mapping_report_id_key" ON "packing_unit_items"("packing_unit_id", "mapping_report_id");

-- CreateIndex
CREATE INDEX "status_events_entity_type_entity_id_idx" ON "status_events"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "sub_categories" ADD CONSTRAINT "sub_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mapping_reports" ADD CONSTRAINT "mapping_reports_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mapping_reports" ADD CONSTRAINT "mapping_reports_sub_category_id_fkey" FOREIGN KEY ("sub_category_id") REFERENCES "sub_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_units" ADD CONSTRAINT "packing_units_source_room_id_fkey" FOREIGN KEY ("source_room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_units" ADD CONSTRAINT "packing_units_transport_unit_id_fkey" FOREIGN KEY ("transport_unit_id") REFERENCES "transport_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_units" ADD CONSTRAINT "packing_units_packed_by_fkey" FOREIGN KEY ("packed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_unit_items" ADD CONSTRAINT "packing_unit_items_packing_unit_id_fkey" FOREIGN KEY ("packing_unit_id") REFERENCES "packing_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_unit_items" ADD CONSTRAINT "packing_unit_items_mapping_report_id_fkey" FOREIGN KEY ("mapping_report_id") REFERENCES "mapping_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_units" ADD CONSTRAINT "transport_units_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transport_units" ADD CONSTRAINT "transport_units_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "status_events" ADD CONSTRAINT "status_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
