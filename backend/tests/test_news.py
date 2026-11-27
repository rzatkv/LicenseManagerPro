"""Panel news tests (v3.0.5): the seeded news.json returns its items, and
a missing or invalid file degrades to an empty list instead of an error."""

import json

import routers.news as news_module


def test_news_returns_seeded_items(client):
    response = client.get("/api/news")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data["items"], list)
    assert len(data["items"]) == 6
    first = data["items"][0]
    assert first["id"] == "v308-release"
    assert "3.0.8" in first["title"]["en"]
    assert first["title"]["fa"]
    assert first["body"]["en"] and first["body"]["fa"]
    assert first["date"] == "2026-11-27"
    assert first["link"].startswith("https://github.com/")


def test_news_missing_file_returns_empty(client, monkeypatch, tmp_path):
    monkeypatch.setattr(news_module, "NEWS_FILE", tmp_path / "no-such-news.json")
    monkeypatch.setattr(news_module, "_cache", {"mtime": None, "items": []})
    response = client.get("/api/news")
    assert response.status_code == 200
    assert response.json() == {"items": []}


def test_news_invalid_json_returns_empty(client, monkeypatch, tmp_path):
    bad = tmp_path / "news.json"
    bad.write_text("{not json", encoding="utf-8")
    monkeypatch.setattr(news_module, "NEWS_FILE", bad)
    monkeypatch.setattr(news_module, "_cache", {"mtime": None, "items": []})
    response = client.get("/api/news")
    assert response.status_code == 200
    assert response.json() == {"items": []}


def test_news_wrong_shape_returns_empty(client, monkeypatch, tmp_path):
    wrong = tmp_path / "news.json"
    wrong.write_text(json.dumps({"items": "not a list"}), encoding="utf-8")
    monkeypatch.setattr(news_module, "NEWS_FILE", wrong)
    monkeypatch.setattr(news_module, "_cache", {"mtime": None, "items": []})
    response = client.get("/api/news")
    assert response.status_code == 200
    assert response.json() == {"items": []}
