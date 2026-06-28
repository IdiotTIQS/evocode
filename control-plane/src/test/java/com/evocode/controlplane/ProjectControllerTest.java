package com.evocode.controlplane;

import com.evocode.controlplane.auth.JwtService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.evocode.controlplane.persistence.MessageRepository;
import com.evocode.controlplane.persistence.ProjectRepository;
import com.evocode.controlplane.persistence.SessionRepository;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class ProjectControllerTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired ProjectRepository repo;
    @Autowired SessionRepository sessions;
    @Autowired MessageRepository messages;
    @Autowired JwtService jwt;

    private String alice;
    private String bob;
    private String admin;

    @BeforeEach
    void setup() {
        messages.deleteAll();
        sessions.deleteAll();
        repo.deleteAll();
        alice = "Bearer " + jwt.issue("user-alice", "alice@e.com", "USER");
        bob = "Bearer " + jwt.issue("user-bob", "bob@e.com", "USER");
        admin = "Bearer " + jwt.issue("user-admin", "admin@e.com", "ADMIN");
    }

    private String createAs(String auth, String name) throws Exception {
        String body = mvc.perform(post("/api/projects").header("Authorization", auth)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"" + name + "\"}"))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return mapper.readTree(body).get("id").asText();
    }

    @Test
    void unauthenticated_request_returns_401() throws Exception {
        mvc.perform(get("/api/projects")).andExpect(status().isUnauthorized());
    }

    @Test
    void create_then_get_and_list_scoped_to_owner() throws Exception {
        String id = createAs(alice, "Alice 的项目");
        mvc.perform(get("/api/projects/" + id).header("Authorization", alice))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Alice 的项目"));
        mvc.perform(get("/api/projects").header("Authorization", alice))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1));
    }

    @Test
    void other_user_cannot_see_or_access_project() throws Exception {
        String id = createAs(alice, "Alice 私有");
        // Bob 的列表里看不到 Alice 的项目
        mvc.perform(get("/api/projects").header("Authorization", bob))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(0));
        // Bob 直接访问 → 404（不泄露存在性）
        mvc.perform(get("/api/projects/" + id).header("Authorization", bob))
            .andExpect(status().isNotFound());
        // Bob 删除 → 404
        mvc.perform(delete("/api/projects/" + id).header("Authorization", bob))
            .andExpect(status().isNotFound());
        // Alice 的项目仍在
        mvc.perform(get("/api/projects/" + id).header("Authorization", alice))
            .andExpect(status().isOk());
    }

    @Test
    void admin_can_see_all_projects() throws Exception {
        createAs(alice, "A");
        createAs(bob, "B");
        mvc.perform(get("/api/projects").header("Authorization", admin))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void patch_and_delete_by_owner() throws Exception {
        String id = createAs(alice, "old");
        mvc.perform(patch("/api/projects/" + id).header("Authorization", alice)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"name\":\"new\",\"repoPath\":\"\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("new"));
        mvc.perform(delete("/api/projects/" + id).header("Authorization", alice))
            .andExpect(status().isNoContent());
        mvc.perform(get("/api/projects/" + id).header("Authorization", alice))
            .andExpect(status().isNotFound());
    }

    @Test
    void delete_cascades_sessions_and_messages() throws Exception {
        String pid = createAs(alice, "casc");
        String sBody = mvc.perform(post("/api/sessions").header("Authorization", alice)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"projectId\":\"" + pid + "\",\"title\":\"s\"}"))
            .andReturn().getResponse().getContentAsString();
        String sid = mapper.readTree(sBody).get("id").asText();
        mvc.perform(post("/api/sessions/" + sid + "/messages").header("Authorization", alice)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"user\",\"kind\":\"intent\",\"text\":\"hi\"}"))
            .andExpect(status().isOk());

        mvc.perform(delete("/api/projects/" + pid).header("Authorization", alice))
            .andExpect(status().isNoContent());
        org.junit.jupiter.api.Assertions.assertEquals(
            0, sessions.findByProjectId(pid).size());
        org.junit.jupiter.api.Assertions.assertEquals(
            0, messages.findBySessionIdOrderByCreatedAtAscIdAsc(sid).size());
    }

    @Test
    void create_with_blank_name_returns_400() throws Exception {
        mvc.perform(post("/api/projects").header("Authorization", alice)
                .contentType(MediaType.APPLICATION_JSON).content("{\"name\":\"\"}"))
            .andExpect(status().isBadRequest());
    }
}
