package com.evocode.controlplane;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.evocode.controlplane.persistence.MessageRepository;
import com.evocode.controlplane.persistence.SessionRepository;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class SessionControllerTest {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper mapper;
    @Autowired SessionRepository sessions;
    @Autowired MessageRepository messages;

    @BeforeEach
    void clean() {
        messages.deleteAll();
        sessions.deleteAll();
    }

    private String createSession(String projectId, String title) throws Exception {
        String body = mvc.perform(post("/api/sessions")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"projectId\":\"" + projectId + "\",\"title\":\"" + title + "\"}"))
            .andExpect(status().isOk())
            .andReturn().getResponse().getContentAsString();
        return mapper.readTree(body).get("id").asText();
    }

    @Test
    void create_then_list_filtered_by_project() throws Exception {
        String s1 = createSession("projA", "会话1");
        createSession("projB", "会话2");

        mvc.perform(get("/api/sessions").param("projectId", "projA"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].id").value(s1));

        mvc.perform(get("/api/sessions"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(2));
    }

    @Test
    void append_messages_roundtrip_and_touch_session() throws Exception {
        String sid = createSession("projA", "会话");

        mvc.perform(post("/api/sessions/" + sid + "/messages")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"user\",\"kind\":\"intent\",\"text\":\"加分页\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.role").value("user"))
            .andExpect(jsonPath("$.text").value("加分页"));

        mvc.perform(post("/api/sessions/" + sid + "/messages")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"agent\",\"kind\":\"result\",\"text\":\"完成\",\"runId\":\"r1\"}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.runId").value("r1"));

        mvc.perform(get("/api/sessions/" + sid + "/messages"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.length()").value(2))
            .andExpect(jsonPath("$[0].text").value("加分页"))   // 按 createdAt 升序
            .andExpect(jsonPath("$[1].text").value("完成"));
    }

    @Test
    void get_unknown_session_and_its_messages_return_404() throws Exception {
        mvc.perform(get("/api/sessions/nope")).andExpect(status().isNotFound());
        mvc.perform(get("/api/sessions/nope/messages")).andExpect(status().isNotFound());
        mvc.perform(post("/api/sessions/nope/messages")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"role\":\"user\",\"kind\":\"intent\",\"text\":\"x\"}"))
            .andExpect(status().isNotFound());
    }

    @Test
    void create_with_blank_fields_returns_400() throws Exception {
        mvc.perform(post("/api/sessions")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"projectId\":\"\",\"title\":\"\"}"))
            .andExpect(status().isBadRequest());
    }
}
