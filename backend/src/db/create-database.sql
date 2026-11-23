-- Выполнить в DBeaver, подключившись к базе postgres под суперпользователем.
-- Пароль ниже нужно заменить и затем повторить его в backend/.env.

-- Пароль придумайте самостоятельно и внесите его в backend/.env.
CREATE ROLE kvartal_app LOGIN PASSWORD 'YOUR_PASSWORD';
CREATE DATABASE kvartal OWNER kvartal_app ENCODING 'UTF8' TEMPLATE template0;
